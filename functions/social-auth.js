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
var { defineString } = require("firebase-functions/params");
var admin = require("firebase-admin"); // index.js에서 initializeApp() 완료됨

// 카카오 앱의 숫자 app_id (개발자 콘솔 → 앱 설정). 설정 시 위조 토큰 방지 강화.
var KAKAO_APP_ID = defineString("KAKAO_APP_ID", { default: "" });

// 커스텀 토큰 발급. provider 클레임을 실어 보안 규칙에서 활용 가능.
function mintToken(uid, provider) {
    return admin.auth().createCustomToken(uid, { provider: provider });
}

// ── 카카오 ──
// data: { accessToken }  →  { token }
exports.kakaoCustomToken = onCall(async function (request) {
    var accessToken = (request.data || {}).accessToken;
    if (!accessToken) {
        throw new HttpsError("invalid-argument", "accessToken이 필요합니다.");
    }
    var authHeader = { Authorization: "Bearer " + accessToken };

    // 1) 토큰 유효성 + (설정 시) 우리 앱 발급 여부 확인
    var infoRes = await fetch("https://kapi.kakao.com/v1/user/access_token_info", {
        headers: authHeader
    });
    if (!infoRes.ok) {
        throw new HttpsError("unauthenticated", "카카오 토큰이 유효하지 않습니다.");
    }
    var info = await infoRes.json();
    var expectedAppId = KAKAO_APP_ID.value();
    if (expectedAppId && String(info.app_id) !== String(expectedAppId)) {
        throw new HttpsError("permission-denied", "다른 앱에서 발급된 카카오 토큰입니다.");
    }

    // 2) 사용자 ID 조회
    var meRes = await fetch("https://kapi.kakao.com/v2/user/me", { headers: authHeader });
    if (!meRes.ok) {
        throw new HttpsError("unauthenticated", "카카오 사용자 조회에 실패했습니다.");
    }
    var me = await meRes.json();
    if (!me || me.id === undefined || me.id === null) {
        throw new HttpsError("internal", "카카오 사용자 ID를 확인할 수 없습니다.");
    }

    var token = await mintToken("kakao:" + me.id, "kakao");
    return { token: token };
});

// ── 네이버 ──
// data: { accessToken }  →  { token }
exports.naverCustomToken = onCall(async function (request) {
    var accessToken = (request.data || {}).accessToken;
    if (!accessToken) {
        throw new HttpsError("invalid-argument", "accessToken이 필요합니다.");
    }

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
