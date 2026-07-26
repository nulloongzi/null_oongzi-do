// social-auth.js — 카카오/네이버 소셜 로그인 → Firebase 커스텀 토큰 발급
//
// 흐름: 클라이언트가 각 제공자 SDK로 로그인해 받은 access token을 onCall로 넘기면,
// 서버가 제공자 API로 토큰을 검증하고 사용자 ID를 얻어 admin.auth().createCustomToken(uid)
// 을 반환한다. 클라이언트는 그 토큰으로 signInWithCustomToken 하면 Firebase 세션이 열린다.
//
// uid 규칙: 'kakao:{id}' / 'naver:{id}' — 제공자별 독립 계정(v1은 이메일 자동 병합 없음).
// (Google/이메일은 기존대로 Firebase 기본 제공자, Meta는 클라 네이티브 provider 사용.)
//
// 보안: 카카오는 access_token_info로 토큰이 "우리 앱"에서 발급됐는지(app_id) 확인한다
// (KAKAO_APP_ID 설정 시). 미설정이면 토큰 유효성만 확인. 네이버는 /nid/me 성공 여부로 검증.
// (네이버 앱 스코프 강제 검증은 v1 범위 밖 — 하드닝 TODO.)

var { onCall, HttpsError } = require("firebase-functions/v2/https");
var { defineString, defineSecret } = require("firebase-functions/params");
var admin = require("firebase-admin"); // index.js에서 initializeApp() 완료됨
var https = require("node:https");

// 카카오 앱의 숫자 app_id (개발자 콘솔 → 앱 설정). 설정 시 위조 토큰 방지 강화.
var KAKAO_APP_ID = defineString("KAKAO_APP_ID", { default: "" });
// 웹(리다이렉트+code) 흐름에서 code→access_token 교환용. 챗봇과 동일 시크릿 재사용.
var KAKAO_REST_API_KEY = defineSecret("KAKAO_REST_API_KEY");
var KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");

// 커스텀 토큰 발급. provider 클레임을 실어 보안 규칙에서 활용 가능.
function mintToken(uid, provider) {
    return admin.auth().createCustomToken(uid, { provider: provider });
}

// ── 카카오 HTTP: 전역 fetch 대신 node:https ──
// Node 22 전역 fetch(undici)는 우리가 안 준 브라우저용 헤더를 멋대로 끼워 넣는다.
// 실측(Node 22.22): accept-language: *, sec-fetch-mode: cors, user-agent: node.
// 406은 원래 Accept-* 협상 실패 코드고, 카카오 인증 서버(kauth) 엣지가 이 조합을
// 거부해 본문과 무관하게 406 not_acceptable(KOE001)을 돌려준다.
// (로컬 curl/axios는 성공, GCF 배포본만 실패 — 증상이 정확히 일치)
// fetch로는 sec-fetch-mode를 지울 수 없어(forbidden header) User-Agent만 붙여선
// 해결이 안 된다. 그래서 node:https로 헤더를 100% 우리가 통제해서 보낸다.
var UA = "nulloongzi-do-functions/1.0";

function requestJson(options, payload) {
    return new Promise(function (resolve, reject) {
        options.timeout = 10000; // 소켓이 물리면 함수 타임아웃(60s)까지 끌지 않도록
        var req = https.request(options, function (res) {
            var chunks = [];
            res.on("data", function (c) { chunks.push(c); });
            res.on("end", function () {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString("utf8")
                });
            });
        });
        req.on("timeout", function () { req.destroy(new Error("카카오 응답 시간 초과")); });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// application/x-www-form-urlencoded POST (카카오 토큰 엔드포인트 규격)
function postForm(host, path, form) {
    var payload = Buffer.from(form, "utf8");
    return requestJson({
        host: host,
        path: path,
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "Content-Length": payload.length,
            "Accept": "application/json",
            "User-Agent": UA
        }
    }, payload);
}

// Bearer 토큰 GET (kapi 사용자 API)
function getWithToken(host, path, accessToken) {
    return requestJson({
        host: host,
        path: path,
        method: "GET",
        headers: {
            Authorization: "Bearer " + accessToken,
            "Accept": "application/json",
            "User-Agent": UA
        }
    });
}

function parseJson(text) {
    try { return JSON.parse(text); } catch (e) { return {}; }
}

// 시크릿 값에 붙은 개행/공백 제거.
// `firebase functions:secrets:set` 을 파이프/붙여넣기로 넣으면 끝에 \n 이 남고,
// 그대로 client_id에 실리면 카카오가 요청을 통째로 거부한다.
function secretValue(param) {
    try { return (param.value() || "").trim(); } catch (e) { return ""; }
}

// 토큰 교환 실패 원인 분류용 프로브(실패 경로에서만 1회).
// 일부러 틀린 refresh_token으로 같은 엔드포인트를 두드려 본다.
//  - 프로브도 406이면 → 카카오 엣지가 이 런타임의 요청 자체를 막는 것(헤더/IP 문제)
//  - 프로브가 정상 JSON 에러면 → 엣지는 정상, authorization_code 파라미터/앱 설정 문제
async function diagnoseKakaoTokenFailure(res, data, restKey, hasSecret) {
    console.error("카카오 code 교환 실패:", JSON.stringify({
        status: res.status,
        body: res.body,
        redirectUri: data.redirectUri,
        codeLen: String(data.code || "").length,
        clientIdLen: restKey.length,
        clientIdTail: restKey.slice(-4),
        hasClientSecret: hasSecret
    }));
    try {
        var probe = await postForm("kauth.kakao.com", "/oauth/token",
            "grant_type=refresh_token" +
            "&client_id=" + encodeURIComponent(restKey) +
            "&refresh_token=nulloongzi_probe");
        console.error("카카오 엣지 프로브:", probe.status, probe.body,
            probe.status === 406
                ? "→ 엣지가 런타임 요청 자체를 차단(헤더/IP 문제)"
                : "→ 엣지 정상, authorization_code 파라미터/앱 설정 문제");
    } catch (e) {
        console.error("카카오 엣지 프로브 실패:", e && e.message);
    }
}

// 카카오 access_token 확보: 앱은 accessToken 직접 전달, 웹은 code→교환.
// (Kakao JS SDK v2는 클라에서 access_token을 안 주고 authorization code만 준다.)
async function resolveKakaoAccessToken(data) {
    if (data.accessToken) return data.accessToken;
    if (!data.code || !data.redirectUri) {
        throw new HttpsError("invalid-argument", "accessToken 또는 (code, redirectUri)가 필요합니다.");
    }
    var restKey = secretValue(KAKAO_REST_API_KEY);
    if (!restKey) {
        throw new HttpsError("failed-precondition", "KAKAO_REST_API_KEY 미설정 - 웹 카카오 로그인 불가.");
    }
    var body = "grant_type=authorization_code" +
        "&client_id=" + encodeURIComponent(restKey) +
        "&redirect_uri=" + encodeURIComponent(data.redirectUri) +
        "&code=" + encodeURIComponent(data.code);
    var clientSecret = secretValue(KAKAO_CLIENT_SECRET);
    if (clientSecret) body += "&client_secret=" + encodeURIComponent(clientSecret);

    var tokRes = await postForm("kauth.kakao.com", "/oauth/token", body);
    var tok = parseJson(tokRes.body);
    if (tokRes.status !== 200 || !tok.access_token) {
        await diagnoseKakaoTokenFailure(tokRes, data, restKey, !!clientSecret);
        // 원인 추적이 되도록 카카오 에러 코드를 클라이언트 메시지에 그대로 실어 보낸다.
        throw new HttpsError("unauthenticated",
            "카카오 인증 코드 교환에 실패했습니다. (" + (tok.error_code || tok.error || tokRes.status) + ")");
    }
    return tok.access_token;
}

// ── 카카오 ──
// data: { accessToken }  (앱 네이티브)  또는  { code, redirectUri }  (웹 리다이렉트)  →  { token }
exports.kakaoCustomToken = onCall(
    { secrets: [KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET] },
    async function (request) {
    var accessToken = await resolveKakaoAccessToken(request.data || {});

    // 1) 토큰 유효성 + (설정 시) 우리 앱 발급 여부 확인
    var infoRes = await getWithToken("kapi.kakao.com", "/v1/user/access_token_info", accessToken);
    if (infoRes.status !== 200) {
        console.error("카카오 토큰 정보 조회 실패:", infoRes.status, infoRes.body);
        throw new HttpsError("unauthenticated", "카카오 토큰이 유효하지 않습니다.");
    }
    var info = parseJson(infoRes.body);
    var expectedAppId = KAKAO_APP_ID.value();
    if (expectedAppId && String(info.app_id) !== String(expectedAppId)) {
        throw new HttpsError("permission-denied", "다른 앱에서 발급된 카카오 토큰입니다.");
    }

    // 2) 사용자 ID 조회
    var meRes = await getWithToken("kapi.kakao.com", "/v2/user/me", accessToken);
    if (meRes.status !== 200) {
        console.error("카카오 사용자 조회 실패:", meRes.status, meRes.body);
        throw new HttpsError("unauthenticated", "카카오 사용자 조회에 실패했습니다.");
    }
    var me = parseJson(meRes.body);
    if (!me || me.id === undefined || me.id === null) {
        throw new HttpsError("internal", "카카오 사용자 ID를 확인할 수 없습니다.");
    }

    var token = await mintToken("kakao:" + me.id, "kakao");
    return { token: token };
});

// 네이버 앱의 Client ID/Secret (개발자센터). 웹(code) 교환용. ID는 공개값, Secret은 비밀.
var NAVER_CLIENT_ID = defineString("NAVER_CLIENT_ID", { default: "41TDNsngcV0J7W6ICtDj" });
var NAVER_CLIENT_SECRET = defineSecret("NAVER_CLIENT_SECRET");

// 네이버 access_token 확보: 앱은 accessToken 직접, 웹은 code→교환.
async function resolveNaverAccessToken(data) {
    if (data.accessToken) return data.accessToken;
    if (!data.code || !data.state) {
        throw new HttpsError("invalid-argument", "accessToken 또는 (code, state)가 필요합니다.");
    }
    var clientId = (NAVER_CLIENT_ID.value() || "").trim();
    var clientSecret = secretValue(NAVER_CLIENT_SECRET);
    if (!clientId || !clientSecret) {
        throw new HttpsError("failed-precondition", "NAVER_CLIENT_ID/SECRET 미설정 - 웹 네이버 로그인 불가.");
    }
    var url = "https://nid.naver.com/oauth2.0/token" +
        "?grant_type=authorization_code" +
        "&client_id=" + encodeURIComponent(clientId) +
        "&client_secret=" + encodeURIComponent(clientSecret) +
        "&code=" + encodeURIComponent(data.code) +
        "&state=" + encodeURIComponent(data.state);
    var tokRes = await fetch(url);
    var tok = await tokRes.json();
    if (!tokRes.ok || !tok.access_token) {
        console.error("네이버 code 교환 실패:", JSON.stringify(tok));
        throw new HttpsError("unauthenticated", "네이버 인증 코드 교환에 실패했습니다.");
    }
    return tok.access_token;
}

// ── 네이버 ──
// data: { accessToken }  (앱)  또는  { code, state }  (웹)  →  { token }
exports.naverCustomToken = onCall(
    { secrets: [NAVER_CLIENT_SECRET] },
    async function (request) {
    var accessToken = await resolveNaverAccessToken(request.data || {});

    var res = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: "Bearer " + accessToken }
    });
    if (!res.ok) {
        throw new HttpsError("unauthenticated", "네이버 토큰이 유효하지 않습니다.");
    }
    var body = await res.json();
    if (!body || body.resultcode !== "00" || !body.response || !body.response.id) {
        throw new HttpsError("unauthenticated", "네이버 사용자 조회에 실패했습니다.");
    }

    var token = await mintToken("naver:" + body.response.id, "naver");
    return { token: token };
});
