// insta-cover.js — 릴스 "정지 커버" 캐싱 (발견 카드용).
//
// 왜: 인스타 embed 위젯은 커버를 크로스 오리진 iframe 안에 그려서 우리가 못 꺼내고,
// 2025-11-03 부터 oEmbed 응답에도 thumbnail_url 이 없다. Meta 가 권한 대안은
// "게시물 HTML 메타데이터에서 직접 가져가라". 실측(2026-09-17): 브라우저 UA 로는 /embed/ 든 permalink 든
// 게시물 데이터 없는 JS 셸만 오고, 링크 미리보기 크롤러 UA(facebookexternalhit)로 permalink 를 받으면
// 서버 렌더된 og:image 가 온다 — 카톡·왓츠앱에 릴스 링크를 붙였을 때 커버가 뜨는 그 경로. 그걸 쓴다.
//
// 인스타 CDN URL 은 서명 만료가 있어 핫링크하면 며칠 뒤 조용히 깨진다. 그래서 이미지를
// 우리 Storage(reel_covers/<code>.jpg, 공개 읽기) 에 저장하고 그 URL 을 insta_reel_covers 맵에 넣는다.
// 클라이언트(웹 insta-embed.js / 앱 ReelCard)는 문서만 읽어 커버를 표시한다 — 뷰마다 API 를 안 때린다.
//
// 키: 릴스 shortcode (URL 의 /reel/<CODE>/). URL 을 맵 키로 쓰면 Firestore 필드경로와 충돌.
// 같은 릴스가 여러 문서에 붙어도 Storage 파일은 하나 — 있으면 재사용.
// 무한 루프 방지: 이미 캐시된 code 만 있으면 write 를 생략(재트리거 시 즉시 종료).
// 실패(비공개·삭제·차단)는 아무것도 쓰지 않는다 → 클라이언트는 제네릭 카드로 폴백.

var { onDocumentWritten } = require("firebase-functions/v2/firestore");
var admin = require("firebase-admin"); // index.js 에서 initializeApp() 완료됨
var crypto = require("crypto");
var pure = require("./lib/pure");

var reelCode = pure.instaReelCode;

// 서버(익명) 요청에 인스타는 게시물 데이터가 없는 JS 앱 셸을 준다(/embed/ 도 마찬가지, 2026-09 확인).
// 서버 렌더된 og:image 를 받는 길은 링크 미리보기 크롤러 UA — 카톡·왓츠앱에 릴스 링크를 붙이면
// 커버가 뜨는 바로 그 경로다. 브라우저 UA 는 마지막 폴백으로만 둔다.
var UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
var UA_CRAWLERS = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "Twitterbot/1.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
];
var FETCH_TIMEOUT_MS = 8000;
var MAX_IMAGE_BYTES = 5 * 1024 * 1024; // storage.rules 의 이미지 상한과 동일

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

async function fetchText(url, ua) {
    var res = await fetch(url, {
        headers: { "User-Agent": ua || UA_BROWSER, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "ko,en;q=0.8" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow"
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
}

// 추출 실패 시 로그용 요약: 길이·<title>·로그인 벽 여부·CDN 이미지 태그 유무. (진단 스크립트도 사용)
function describeHtml(html) {
    var h = String(html || "");
    var title = (h.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
    return "len=" + h.length +
        " title=" + JSON.stringify(title.trim().slice(0, 60)) +
        " login=" + /accounts\/login|LoginAndSignupPage/i.test(h) +
        " cdnImg=" + /<img[^>]+cdninstagram\.com/i.test(h) +
        " ogImage=" + /property="og:image"/i.test(h) +
        " displayUrl=" + /"display_url"/.test(h) +
        " embeddedMedia=" + /EmbeddedMedia/i.test(h);
}

// 시도 순서. 각 후보는 { kind, url, ua }. kind=page 는 HTML 에서 추출, kind=media 는 리다이렉트 Location.
function candidates(code) {
    var list = [];
    var permalink = "https://www.instagram.com/p/" + code + "/";
    var reel = "https://www.instagram.com/reel/" + code + "/";
    for (var i = 0; i < UA_CRAWLERS.length; i++) {
        list.push({ kind: "page", url: permalink, ua: UA_CRAWLERS[i] });
        list.push({ kind: "page", url: reel, ua: UA_CRAWLERS[i] });
    }
    // 옛 /media/?size=l 리다이렉트(살아 있으면 가장 싸다)
    list.push({ kind: "media", url: permalink + "media/?size=l", ua: UA_BROWSER });
    list.push({ kind: "page", url: reel + "embed/", ua: UA_BROWSER });
    list.push({ kind: "page", url: permalink, ua: UA_BROWSER });
    return list;
}

// 후보 하나 시도 → { url: 커버 URL | null, note: 진단 문자열 }
async function tryCandidate(c) {
    try {
        if (c.kind === "media") {
            var r = await fetch(c.url, {
                headers: { "User-Agent": c.ua },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                redirect: "manual"
            });
            var loc = r.headers.get("location") || "";
            if (r.status >= 300 && r.status < 400 && pure.isInstaCdnUrl(loc)) return { url: loc, note: "redirect " + r.status };
            return { url: null, note: "status=" + r.status + " location=" + JSON.stringify(loc.slice(0, 80)) };
        }
        var html = await fetchText(c.url, c.ua);
        var u = pure.extractInstaPoster(html);
        if (u && pure.isInstaCdnUrl(u)) return { url: u, note: "ok" };
        return { url: null, note: (u ? "non-cdn " + u.slice(0, 60) + " " : "") + describeHtml(html), html: html };
    } catch (e) {
        return { url: null, note: "요청 실패: " + (e && e.message) };
    }
}

// 후보를 순서대로 → 첫 성공의 커버 URL. 전부 실패면 마지막 요약을 남기고 null.
async function fetchPosterUrl(code) {
    var list = candidates(code);
    var last = "";
    for (var i = 0; i < list.length; i++) {
        var r = await tryCandidate(list[i]);
        if (r.url) return r.url;
        last = list[i].kind + " " + list[i].url + " [" + list[i].ua.slice(0, 20) + "] → " + r.note;
    }
    console.warn("포스터 추출 실패:", code, "마지막 시도:", last);
    return null;
}

function downloadUrl(bucket, filePath, token) {
    return "https://firebasestorage.googleapis.com/v0/b/" + bucket.name +
        "/o/" + encodeURIComponent(filePath) + "?alt=media&token=" + token;
}

// 커버를 Storage 에 저장하고 공개 다운로드 URL 반환. 이미 있으면 그 파일을 재사용.
async function cacheCover(code) {
    var bucket = admin.storage().bucket();
    var filePath = "reel_covers/" + code + ".jpg";
    var file = bucket.file(filePath);

    var exists = (await file.exists())[0];
    if (exists) {
        var meta = (await file.getMetadata())[0];
        var existingToken = meta && meta.metadata && meta.metadata.firebaseStorageDownloadTokens;
        if (existingToken) return downloadUrl(bucket, filePath, String(existingToken).split(",")[0]);
    }

    var src = await fetchPosterUrl(code);
    if (!src) return null;

    var res = await fetch(src, {
        headers: { "User-Agent": UA_BROWSER },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) { console.warn("커버 이미지 응답 실패:", code, res.status); return null; }
    var type = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type.indexOf("image/") !== 0 || type === "image/svg+xml") {
        console.warn("커버가 이미지가 아님:", code, type);
        return null;
    }
    var buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) {
        console.warn("커버 크기 이상:", code, buf.length);
        return null;
    }

    var token = crypto.randomUUID();
    await file.save(buf, {
        contentType: type,
        resumable: false,
        metadata: {
            cacheControl: "public, max-age=2592000", // 30일 — 커버는 사실상 불변
            metadata: { firebaseStorageDownloadTokens: token, source: "instagram_embed", code: code }
        }
    });
    return downloadUrl(bucket, filePath, token);
}

// 공용 핸들러: clubs/pickup_games 문서의 릴스 커버를 캐싱.
async function handle(event) {
    var after = event.data && event.data.after;
    if (!after || !after.exists) return; // 삭제
    var d = after.data() || {};
    var urls = reelUrls(d);
    if (!urls.length) return;

    var covers = (d.insta_reel_covers && typeof d.insta_reel_covers === "object") ? d.insta_reel_covers : {};

    // code 기준으로 아직 우리 캐시가 아닌 것만 (무한 루프 가드). 예전 oEmbed 시절의 인스타 CDN 값은
    // 서명 만료로 죽어 있으니 다시 캐싱한다. 실패하면 기존 값을 그대로 두고 아무것도 쓰지 않는다.
    var pending = [];
    var seen = {};
    for (var i = 0; i < urls.length; i++) {
        var code = reelCode(urls[i]);
        if (!code || pure.isCachedCoverUrl(covers[code]) || seen[code]) continue;
        seen[code] = true;
        pending.push(code);
    }
    if (!pending.length) return;

    var merged = Object.assign({}, covers);
    var changed = false;
    for (var j = 0; j < pending.length; j++) {
        try {
            var cover = await cacheCover(pending[j]);
            if (cover) {
                merged[pending[j]] = cover;
                changed = true;
            }
        } catch (e) {
            console.error("커버 캐싱 오류:", pending[j], e && e.message);
        }
    }
    if (!changed) return;
    await after.ref.set({ insta_reel_covers: merged }, { merge: true });
}

exports.cacheClubReelCovers = onDocumentWritten({ document: "clubs/{clubId}" }, handle);
exports.cachePickupReelCovers = onDocumentWritten({ document: "pickup_games/{gameId}" }, handle);

// 순수 로직 테스트용 + 백필 스크립트(scripts/backfill-reel-covers.js)용 export
exports._reelCode = reelCode;
exports._reelUrls = reelUrls;
exports._handle = handle;
exports._fetchText = fetchText;
exports._describeHtml = describeHtml;
exports._fetchPosterUrl = fetchPosterUrl;
exports._candidates = candidates;
exports._tryCandidate = tryCandidate;
