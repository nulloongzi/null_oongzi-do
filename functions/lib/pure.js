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

// ── 딥링크 URL ──────────────────────────────────────────────────
// 카카오 알림의 '자세히 보기'는 지금까지 사이트 첫 화면으로만 갔다. 신고를 받고
// 눌러도 "어느 팀이었지"부터 다시 찾아야 했다는 뜻이다 — 알림에 대상 이름이
// 적혀 있는데도.
//
// 착지 처리는 이미 양쪽에 다 있다(웹 js/app.js 의 ?club=/?spot=, 앱
// deep_link_service.dart). 링크를 안 만들어 주고 있었을 뿐이라 여기서 붙인다.
//
// 픽업의 쿼리 키는 'spot' 인데 reports.kind 는 'pickup' 이다. 이 어긋남을
// 호출부마다 기억하게 두면 언젠가 틀린다 — 여기서 한 번만 옮긴다.
var SITE_ORIGIN = "https://do.nulloongzi.com";

var DEEP_LINK_PARAM = {
    club: "club",
    pickup: "spot",
    spot: "spot"
};

function deepLinkUrl(kind, id) {
    var key = DEEP_LINK_PARAM[String(kind || "")];
    var value = String(id == null ? "" : id).trim();
    // 대상이 없으면 첫 화면으로. 빈 ?club= 를 달면 착지 쪽이 헛돈다.
    if (!key || !value) return SITE_ORIGIN;
    return SITE_ORIGIN + "/?" + key + "=" + encodeURIComponent(value);
}

// 카카오 template_object 의 link 는 web/mobile 두 벌을 같은 값으로 요구한다.
function kakaoLink(kind, id) {
    var url = deepLinkUrl(kind, id);
    return { web_url: url, mobile_web_url: url };
}

// ── 팀 관리자 ────────────────────────────────────────────────────
// 팀 하나를 여러 사람이 관리한다. 동호회 운영은 대개 한 사람이 하지 않고,
// 담당자가 바뀌어도 팀 정보가 방치되지 않아야 한다.
//
// 정원 3명은 운영자가 정한 값이다. 최초 등록자도 이 3명 안에 든다 —
// "등록자 1 + 관리자 3" 보다 "관리자 3명"이 설명하기 쉽다.
var MAX_CLUB_ADMINS = 3;

// 이 팀을 관리할 수 있는 uid 목록.
//
// admins 배열이 정본이지만, 그 필드가 생기기 전에 만들어진 문서에는 없다.
// 그때는 registered_by 한 사람을 관리자로 본다 — 마이그레이션을 안 돌려도
// 기존 소유자가 권한을 잃지 않는다. (firestore.rules 도 같은 폴백을 쓴다.
// 두 곳의 규칙이 어긋나면 화면엔 버튼이 보이는데 저장은 거부되는 꼴이 된다.)
function clubAdminUids(club) {
    var c = club || {};
    var out = [];
    var list = Array.isArray(c.admins) ? c.admins : [];
    for (var i = 0; i < list.length; i++) {
        var s = String(list[i] == null ? "" : list[i]).trim();
        if (s && out.indexOf(s) === -1) out.push(s);
    }
    if (!out.length && c.registered_by) {
        var owner = String(c.registered_by).trim();
        if (owner) out.push(owner);
    }
    return out;
}

function canManageClub(club, uid) {
    var u = String(uid == null ? "" : uid).trim();
    if (!u) return false;
    return clubAdminUids(club).indexOf(u) !== -1;
}

// 지금 이 사람을 관리자로 받아도 되나. 막는 이유를 문자열로 돌려준다.
function adminRequestBlockReason(club, uid) {
    if (!club) return "not_found";
    var u = String(uid == null ? "" : uid).trim();
    if (!u) return "no_uid";
    var admins = clubAdminUids(club);
    if (admins.indexOf(u) !== -1) return "already_admin";
    if (admins.length >= MAX_CLUB_ADMINS) return "full";
    return null;
}

// 승인 시점에 다시 계산한다. 신청이 접수된 뒤 정원이 찼을 수 있다.
function addClubAdmin(club, uid) {
    var blocked = adminRequestBlockReason(club, uid);
    if (blocked) return { admins: clubAdminUids(club), added: false, reason: blocked };
    return {
        admins: clubAdminUids(club).concat([String(uid).trim()]),
        added: true,
        reason: null
    };
}

// 스스로 빠지기. 마지막 한 명이 나가면 팀은 관리자 없는 상태로 돌아간다 —
// 그래야 팀을 떠난 사람이 수정 권한을 쥔 채 남지 않고, 다음 사람이 신청할 수
// 있다. 막아두면 "그만뒀는데 못 빠지는" 쪽이 되어 더 나쁘다.
function removeClubAdmin(club, uid) {
    var u = String(uid == null ? "" : uid).trim();
    var admins = clubAdminUids(club);
    var at = admins.indexOf(u);
    if (at === -1) return { admins: admins, removed: false, reason: "not_admin" };
    var next = admins.slice(0, at).concat(admins.slice(at + 1));
    return { admins: next, removed: true, reason: null };
}

// ── 위치 공개 수준 ───────────────────────────────────────────────
// 팀은 대개 학교·구민 체육관을 빌려 쓴다. 장소와 시간표를 함께 공개하면
// "그 체육관 그 시간에 누가 쓰는지"가 누구에게나 보인다 — 대관에서 밀린
// 사람이 그걸 보고 찾아가 민원을 넣은 일이 실제로 있었다(2026-09, 교사 동호회).
//
// 그래서 팀이 공개 수준을 고른다. 'area' 를 고르면 **화면에서만 흐리는 게
// 아니라 애초에 정확한 좌표를 저장하지 않는다.** clubs 는 allow read: if true
// 라서, 정확한 값을 두고 UI 에서만 가리면 Firestore 를 직접 읽어 그대로 꺼낸다.
//
// 격자 0.005° ≈ 위도 550m · 경도 440m(위도 37° 기준). 동네를 찾는 데는 충분하고
// 건물 한 채를 짚기에는 모자란 크기를 노렸다.
var AREA_GRID_DIVISOR = 200; // 1/0.005

// 저장용 좌표. 규칙(firestore.rules)이 **같은 식**으로 검증하므로 식을 바꾸면
// 양쪽을 함께 바꿔야 한다 — 부동소수 결과가 비트 단위로 같아야 통과한다.
function roundToAreaGrid(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return Math.round(n * AREA_GRID_DIVISOR) / AREA_GRID_DIVISOR;
}

function isAreaGridAligned(v) {
    var n = Number(v);
    if (!isFinite(n)) return false;
    return roundToAreaGrid(n) === n;
}

// 주소에서 시군구까지만 남긴다. 체육관 이름이 진짜 위험한 부분이라 통째로 버린다.
//   "서울 성북구 화랑로13길 144"                    → "서울 성북구"
//   "경기도 성남시 분당구 양현로 262"               → "경기도 성남시 분당구"
//   "구리 여자중학교 체육관(경기도 구리시 벌말로 168)" → "경기도 구리시"
//
// 앞에서부터 자르지 않고 **행정구역 토큰을 찾아서** 시작한다. 실제 입력은
// "체육관 이름 + (주소)" 처럼 장소 이름이 앞에 오는 경우가 많아, 첫 토큰을
// 그대로 쓰면 엉뚱한 말("구리 여자중학교" 의 '구리')이 라벨이 된다.
//
// 못 찾으면 빈 문자열이다 — "하남종합운동장국민체육센터" 처럼 주소가 아예 없는
// 입력도 흔하다. 그때는 호출부가 좌표를 역지오코딩해 라벨을 만든다.
var SIDO_PREFIX = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청|전라|경상)/;

function areaLabel(address) {
    var raw = String(address == null ? "" : address)
        .replace(/[()[\]]/g, " ")
        .trim().replace(/\s+/g, " ");
    if (!raw) return "";
    var parts = raw.split(" ");
    var start = -1;
    for (var i = 0; i < parts.length; i++) {
        if (SIDO_PREFIX.test(parts[i])) { start = i; break; }
    }
    if (start === -1) return "";
    var out = [parts[start]];
    for (var j = start + 1; j < parts.length && out.length < 3; j++) {
        if (!/[시군구]$/.test(parts[j])) break;
        out.push(parts[j]);
    }
    return out.join(" ");
}

// 'exact' 가 기본이다. 필드가 없는 기존 문서는 지금까지처럼 정확히 보인다 —
// 조용히 뭉개면 팀이 모르는 사이에 지도에서 옮겨진 것처럼 보인다.
function locationPrecision(club) {
    var v = club && club.location_precision;
    return v === "area" ? "area" : "exact";
}

function isAreaOnly(club) {
    return locationPrecision(club) === "area";
}

module.exports = {
    escapeHtml: escapeHtml,
    AREA_GRID_DIVISOR: AREA_GRID_DIVISOR,
    roundToAreaGrid: roundToAreaGrid,
    isAreaGridAligned: isAreaGridAligned,
    areaLabel: areaLabel,
    locationPrecision: locationPrecision,
    isAreaOnly: isAreaOnly,
    MAX_CLUB_ADMINS: MAX_CLUB_ADMINS,
    clubAdminUids: clubAdminUids,
    canManageClub: canManageClub,
    adminRequestBlockReason: adminRequestBlockReason,
    addClubAdmin: addClubAdmin,
    removeClubAdmin: removeClubAdmin,
    SITE_ORIGIN: SITE_ORIGIN,
    deepLinkUrl: deepLinkUrl,
    kakaoLink: kakaoLink,
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
