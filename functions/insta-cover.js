// insta-cover.js — 릴스 "정지 커버" 캐싱 (발견 카드용).
//
// 왜: 인스타 embed 위젯은 커버를 크로스 오리진 iframe 안에 그려서 우리가 못 꺼내고,
// 2025-11-03 부터 oEmbed 응답에도 thumbnail_url 이 없다. Meta 가 권한 대안은
// "게시물 HTML 메타데이터에서 직접 가져가라" → 익명 fetch 용 /embed/ 페이지에서 포스터를 뽑는다.
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

// 브라우저처럼 보여야 /embed/ 가 정상 HTML 을 준다(봇 UA 는 로그인 벽으로 보낼 수 있음).
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
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

async function fetchText(url) {
    var res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "ko,en;q=0.8" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow"
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
}

// /embed/ → 포스터 URL. 없으면 permalink 의 og:image 로 한 번 더.
async function fetchPosterUrl(code) {
    var pages = [
        "https://www.instagram.com/reel/" + code + "/embed/",
        "https://www.instagram.com/p/" + code + "/"
    ];
    for (var i = 0; i < pages.length; i++) {
        try {
            var html = await fetchText(pages[i]);
            var u = pure.extractInstaPoster(html);
            if (u && pure.isInstaCdnUrl(u)) return u;
            if (u) console.warn("커버 URL 이 인스타 CDN 이 아님 — 무시:", code, u.slice(0, 80));
        } catch (e) {
            console.warn("커버 페이지 요청 실패:", pages[i], e && e.message);
        }
    }
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
        headers: { "User-Agent": UA },
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

    // code 기준으로 아직 커버 없는 것만 (무한 루프 가드)
    var pending = [];
    var seen = {};
    for (var i = 0; i < urls.length; i++) {
        var code = reelCode(urls[i]);
        if (!code || covers[code] || seen[code]) continue;
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

// 순수 로직 테스트용 export
exports._reelCode = reelCode;
exports._reelUrls = reelUrls;
