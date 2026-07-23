// insta-cover.js — 릴스 "정지 커버" 캐싱 (발견 카드용).
//
// 왜: 인스타 embed 위젯은 커버를 크로스 오리진 iframe 안에 그려서 우리가 못 꺼낸다.
// 릴스의 실제 커버 프레임을 합법적으로 얻는 유일한 길은 인스타 oEmbed의 thumbnail_url.
// 클럽/픽업 문서에 릴스 URL이 있으면 커버를 받아 insta_reel_covers 맵에 캐싱한다.
// (뷰마다 API를 때리지 않도록 문서에 저장 → 클라이언트는 문서만 읽어 커버 표시.)
//
// 키: 릴스 shortcode (URL의 /reel/<CODE>/). URL을 맵 키로 쓰면 Firestore 필드경로와
// 충돌하므로 shortcode를 키로 사용. 클라이언트도 같은 방식으로 code를 추출해 조회.
//
// oEmbed Read 미승인/토큰 미설정 시엔 조용히 스킵(커버 없음) → 클라이언트는 기존 카드로 폴백.
// 무한 루프 방지: 이미 캐시된 code만 있으면 write를 생략(재트리거 시 즉시 종료).
// 커버 URL(인스타 CDN)은 만료될 수 있음 → 클라이언트 <img>/Image.network 에러 시 기존 카드로 폴백.

var { onDocumentWritten } = require("firebase-functions/v2/firestore");
var { defineSecret } = require("firebase-functions/params");

// 앱 액세스 토큰 "APP_ID|CLIENT_TOKEN" 형식 (client token은 비밀이 아니지만 secret으로 관리).
var META_OEMBED_TOKEN = defineSecret("META_OEMBED_TOKEN");

// 공개 인스타 게시물/릴스 URL만 허용(SSRF/오용 방지) + shortcode 추출
function reelCode(u) {
    if (typeof u !== "string") return null;
    var m = u.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

// insta_reels(배열) 우선 + insta_reel(단일) 폴백 → URL 배열
function reelUrls(d) {
    var out = [];
    var arr = d && d.insta_reels;
    if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
            if (typeof arr[i] === "string" && arr[i]) out.push(arr[i]);
        }
    }
    if (!out.length && d && typeof d.insta_reel === "string" && d.insta_reel) {
        out.push(d.insta_reel);
    }
    return out;
}

async function fetchCover(url, token) {
    var api = "https://graph.facebook.com/v19.0/instagram_oembed" +
        "?url=" + encodeURIComponent(url) +
        "&fields=thumbnail_url&maxwidth=640&omitscript=true" +
        "&access_token=" + encodeURIComponent(token);
    try {
        var res = await fetch(api);
        var json = await res.json();
        if (json && json.thumbnail_url) return json.thumbnail_url;
        console.warn("oEmbed 커버 실패:", url, JSON.stringify((json && json.error) || json));
    } catch (e) {
        console.error("oEmbed 요청 오류:", url, e && e.message);
    }
    return null;
}

// 공용 핸들러: clubs/pickup_games 문서의 릴스 커버를 캐싱.
async function handle(event) {
    var after = event.data && event.data.after;
    if (!after || !after.exists) return; // 삭제
    var d = after.data() || {};
    var urls = reelUrls(d);
    if (!urls.length) return;

    var token = META_OEMBED_TOKEN.value();
    if (!token) {
        console.warn("META_OEMBED_TOKEN 미설정 - 릴스 커버 캐싱 스킵");
        return;
    }

    var covers = (d.insta_reel_covers && typeof d.insta_reel_covers === "object") ? d.insta_reel_covers : {};

    // code 기준으로 아직 커버 없는 것만 (무한 루프 가드)
    var pending = [];
    var seen = {};
    for (var i = 0; i < urls.length; i++) {
        var code = reelCode(urls[i]);
        if (!code || covers[code] || seen[code]) continue;
        seen[code] = true;
        pending.push({ code: code, url: urls[i] });
    }
    if (!pending.length) return;

    var merged = Object.assign({}, covers);
    var changed = false;
    for (var j = 0; j < pending.length; j++) {
        var cover = await fetchCover(pending[j].url, token);
        if (cover) {
            merged[pending[j].code] = cover;
            changed = true;
        }
    }
    if (!changed) return;
    await after.ref.set({ insta_reel_covers: merged }, { merge: true });
}

exports.cacheClubReelCovers = onDocumentWritten(
    { document: "clubs/{clubId}", secrets: [META_OEMBED_TOKEN] },
    handle
);

exports.cachePickupReelCovers = onDocumentWritten(
    { document: "pickup_games/{gameId}", secrets: [META_OEMBED_TOKEN] },
    handle
);

// 순수 로직 테스트용 export
exports._reelCode = reelCode;
exports._reelUrls = reelUrls;
