// pure.js — Cloud Functions의 순수 로직 추출 (Phase 2, 방법론 "티어 1.5 소규모 추출").
// firebase 의존 없음 → 루트 `node --test`(tests/functions-pure.test.js)로 에뮬레이터 없이 검증.
// index.js가 require하여 사용. 동작은 기존 인라인 구현과 동일(단, renderResultPage는
// HTML 이스케이프가 추가됨 — club_name 등 사용자 입력이 관리자 브라우저에 그대로
// 삽입되던 XSS 가능성 수정).
var crypto = require("crypto");

// HTML 특수문자 이스케이프 (웹 dom-utils escapeHtml과 동일 정책)
function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// HMAC 토큰 생성 (승인/거절 링크 보안용)
function generateToken(secret, requestId, action) {
    return crypto
        .createHmac("sha256", secret)
        .update(requestId + action)
        .digest("hex")
        .substring(0, 16);
}

// 권한 없음 응답 (카카오 챗봇 통일 포맷)
function unauthorizedResponse() {
    return {
        version: "2.0",
        template: {
            outputs: [{
                simpleText: {
                    text: "⛔ 권한이 없습니다.\n\n이 명령어는 관리자 전용입니다."
                }
            }]
        }
    };
}

// 챗봇 요청에서 request_id 추출: 버튼 extra(clientExtra) 우선, utterance 마지막 토큰 폴백.
// (chatbotApprove / chatbotRejectAsk 공통 — 기존 3중 복붙을 단일 소스로)
function extractRequestId(body) {
    var clientExtra = (body && body.action && body.action.clientExtra) || {};
    var requestId = clientExtra.request_id || "";
    var source = "clientExtra";
    if (!requestId) {
        source = "utterance";
        var utterance = (body && body.userRequest && body.userRequest.utterance) || "";
        var parts = utterance.split(/\s+/);
        requestId = parts.length > 1 ? parts[parts.length - 1].trim() : "";
    }
    return { requestId: requestId, source: source };
}

// 거절확정 요청 파싱: clientExtra → action.params → contexts(reject_context) 3중 폴백.
// reason은 clientExtra.reason 우선, 없으면 utterance 전체.
function extractRejectInfo(body) {
    body = body || {};
    var clientExtra = (body.action && body.action.clientExtra) || {};
    var requestId = clientExtra.request_id || null;
    var clubName = clientExtra.club_name || null;
    var reason = clientExtra.reason ||
        (body.userRequest && body.userRequest.utterance) || "";
    var contexts = clientExtra.contexts || body.contexts || [];

    if (!requestId && body.action && body.action.params) {
        requestId = body.action.params.request_id;
        clubName = body.action.params.club_name;
    }
    if (!requestId && Array.isArray(contexts)) {
        for (var i = 0; i < contexts.length; i++) {
            if (contexts[i].name === "reject_context") {
                requestId = contexts[i].params.request_id && contexts[i].params.request_id.value;
                clubName = contexts[i].params.club_name && contexts[i].params.club_name.value;
                break;
            }
        }
    }
    var source = clientExtra.request_id ? "clientExtra" : "fallback";
    return { requestId: requestId, clubName: clubName, reason: reason, source: source };
}

// 승인/거절 결과 페이지. title/message는 이스케이프되어 삽입된다(XSS 방지).
function renderResultPage(title, message) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>누룽지도 인증 관리</title>' +
        '<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fff8e1;}' +
        '.card{background:#fff;border-radius:20px;padding:40px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:400px;}' +
        'h1{color:#4e342e;font-size:24px;}p{color:#666;font-size:16px;line-height:1.5;}</style></head>' +
        '<body><div class="card"><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(message) + '</p></div></body></html>';
}

module.exports = {
    escapeHtml: escapeHtml,
    generateToken: generateToken,
    unauthorizedResponse: unauthorizedResponse,
    extractRequestId: extractRequestId,
    extractRejectInfo: extractRejectInfo,
    renderResultPage: renderResultPage
};
