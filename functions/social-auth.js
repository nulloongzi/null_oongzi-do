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
var providerHttp = require("./lib/provider-http");
var secretValue = providerHttp.secretValue;

// 카카오 앱의 숫자 app_id (개발자 콘솔 → 앱 설정). 설정 시 위조 토큰 방지 강화.
var KAKAO_APP_ID = defineString("KAKAO_APP_ID", { default: "" });
// 웹(리다이렉트+code) 흐름에서 code→access_token 교환용. 챗봇과 동일 시크릿 재사용.
var KAKAO_REST_API_KEY = defineSecret("KAKAO_REST_API_KEY");
var KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");

// 커스텀 토큰 발급. provider 클레임을 실어 보안 규칙에서 활용 가능.
function mintToken(uid, provider) {
    return admin.auth().createCustomToken(uid, { provider: provider });
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
        var probe = await providerHttp.postForm(providerHttp.KAUTH_HOST, "/oauth/token",
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

    var tokRes = await providerHttp.postForm(providerHttp.KAUTH_HOST, "/oauth/token", body);
    var tok = providerHttp.parseJson(tokRes.body);
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
    var infoRes = await providerHttp.getWithToken(providerHttp.KAPI_HOST, "/v1/user/access_token_info", accessToken);
    if (infoRes.status !== 200) {
        console.error("카카오 토큰 정보 조회 실패:", infoRes.status, infoRes.body);
        throw new HttpsError("unauthenticated", "카카오 토큰이 유효하지 않습니다.");
    }
    var info = providerHttp.parseJson(infoRes.body);
    var expectedAppId = KAKAO_APP_ID.value();
    if (expectedAppId && String(info.app_id) !== String(expectedAppId)) {
        throw new HttpsError("permission-denied", "다른 앱에서 발급된 카카오 토큰입니다.");
    }

    // 2) 사용자 ID 조회
    var meRes = await providerHttp.getWithToken(providerHttp.KAPI_HOST, "/v2/user/me", accessToken);
    if (meRes.status !== 200) {
        console.error("카카오 사용자 조회 실패:", meRes.status, meRes.body);
        throw new HttpsError("unauthenticated", "카카오 사용자 조회에 실패했습니다.");
    }
    var me = providerHttp.parseJson(meRes.body);
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
    var path = "/oauth2.0/token" +
        "?grant_type=authorization_code" +
        "&client_id=" + encodeURIComponent(clientId) +
        "&client_secret=" + encodeURIComponent(clientSecret) +
        "&code=" + encodeURIComponent(data.code) +
        "&state=" + encodeURIComponent(data.state);
    var tokRes = await providerHttp.getJson(providerHttp.NAVER_AUTH_HOST, path);
    var tok = providerHttp.parseJson(tokRes.body);
    if (tokRes.status !== 200 || !tok.access_token) {
        console.error("네이버 code 교환 실패:", tokRes.status, tokRes.body);
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

    var res = await providerHttp.getWithToken(providerHttp.NAVER_API_HOST, "/v1/nid/me", accessToken);
    if (res.status !== 200) {
        console.error("네이버 토큰 정보 조회 실패:", res.status, res.body);
        throw new HttpsError("unauthenticated", "네이버 토큰이 유효하지 않습니다.");
    }
    var body = providerHttp.parseJson(res.body);
    if (!body || body.resultcode !== "00" || !body.response || !body.response.id) {
        throw new HttpsError("unauthenticated", "네이버 사용자 조회에 실패했습니다.");
    }

    var token = await mintToken("naver:" + body.response.id, "naver");
    return { token: token };
});
