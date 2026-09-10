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

// ── 카카오 refresh token 선택 ────────────────────────────────────
// 회전된 토큰은 system/kakao_token 에 쌓이고, 시크릿은 seed 역할만 한다.
// "저장분과 seed 중 무엇을 쓸 것인가"가 이 기능의 전부이자, 틀리면 60일 뒤
// 알림이 조용히 끊기는 지점이다(2026-09-08 KOE322 장애). 그래서 I/O 를 뺀
// 판단만 여기로 꺼내 테스트로 고정한다.
//
// 규칙: 저장된 회전분이 있고 그것이 **현재 seed 에서 파생된 것**일 때만 쓴다.
// 운영자가 시크릿을 새 값으로 갈아끼우면 지문이 달라지므로 저장분을 버린다 —
// 수동 복구가 항상 자동 회전분을 이겨야 한다.
function refreshTokenFingerprint(v) {
    return crypto.createHash("sha256").update(String(v || "")).digest("hex").slice(0, 16);
}

function chooseRefreshToken(cached, seedRefresh) {
    var c = cached || {};
    var fp = refreshTokenFingerprint(seedRefresh);
    var usingStored = !!(c.refresh_token && c.refresh_token_seed_fp === fp);
    return {
        token: usingStored ? c.refresh_token : seedRefresh,
        usingStored: usingStored,
        seedFp: fp
    };
}

// ── 카카오 장소(키워드) 검색 응답 → 좌표 ──────────────────────────
// 주소 지오코딩은 '주소'만 안다. 배구 동호회의 주소칸에는 '석관중', '잠실학생체육관'
// 처럼 **장소 이름**이 들어오는 게 자연스럽고(체육관 이름으로 찾는다), 그때 주소
// 전용 지오코더는 0건을 돌려준다. 그 폴백으로 쓰는 카카오 키워드 검색의 응답 파싱.
// 좌표가 숫자로 안 오면 버린다 — NaN 이 그대로 Firestore 에 박히면 지도에서 사라진다.
function pickKakaoPlace(json) {
    var docs = json && json.documents;
    if (!docs || !docs.length) return null;
    var d = docs[0];
    var lat = parseFloat(d.y);
    var lng = parseFloat(d.x);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return {
        lat: lat,
        lng: lng,
        roadAddress: d.road_address_name || d.address_name || null,
        placeName: d.place_name || null
    };
}

// ── 팀 소유권 클레임(과거 구글시트 접수 메일 ↔ 가입자 매핑) ─────────
// 초기 51개 팀은 구글시트로 접수했고, 그때 받은 담당자 메일이 있다. 나중에
// 같은 메일로 가입한 사람이 있으면 그 팀의 소유자로 이어주려는 것.
//
// 매칭은 공백 제거 + 소문자화만 한다. gmail 의 점·+별칭까지 같은 사서함으로
// 접어주면 매칭률은 오르지만, 도메인마다 규칙이 달라 남의 팀에 붙을 위험이
// 생긴다. 어차피 운영자가 승인하는 구조라 **덜 잡히는 쪽**을 택한다.
function normalizeEmail(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    // 형식이 아니면 빈 문자열 — 시트에 '없음', '-' 같은 값이 섞여 들어온다.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
    return s;
}

// 알림·승인 화면에 쓸 가림 표기. 운영자는 원본 시트를 갖고 있으므로 앞 몇 자로
// 충분히 대조되고, 카톡/로그에 주소 전문이 남지 않는다.
function maskEmail(v) {
    var s = normalizeEmail(v);
    if (!s) return "";
    var at = s.indexOf("@");
    var local = s.slice(0, at), domain = s.slice(at);
    var keep = local.length <= 2 ? 1 : Math.min(3, local.length - 1);
    return local.slice(0, keep) + "***" + domain;
}

// 이 팀을 지금 이 사람에게 넘겨도 되나. 이미 주인이 있는 팀은 절대 건드리지
// 않는다 — 메일이 맞다고 남의 팀을 빼앗을 수는 없다(시트의 메일이 낡았거나
// 담당자가 바뀌었을 수 있다). 그런 건 운영자가 손으로 옮긴다.
function claimBlockReason(club) {
    if (!club) return "not_found";
    var owner = club.registered_by;
    if (owner != null && String(owner).length > 0) return "already_owned";
    return null;
}

module.exports = {
    escapeHtml: escapeHtml,
    normalizeEmail: normalizeEmail,
    maskEmail: maskEmail,
    claimBlockReason: claimBlockReason,
    pickKakaoPlace: pickKakaoPlace,
    generateToken: generateToken,
    unauthorizedResponse: unauthorizedResponse,
    extractRequestId: extractRequestId,
    extractRejectInfo: extractRejectInfo,
    renderResultPage: renderResultPage,
    refreshTokenFingerprint: refreshTokenFingerprint,
    chooseRefreshToken: chooseRefreshToken
};
