#!/usr/bin/env node
/**
 * 릴스 커버 백필 — 이미 있는 clubs / pickup_games 문서의 커버를 우리 Storage 에 캐싱한다.
 *
 * 왜: Cloud Function(functions/insta-cover.js)은 문서가 *써질 때* 만 돈다. 예전 oEmbed 시절에
 * 인스타 CDN URL 이 박힌 문서(서명 만료로 죽음)나 커버가 아예 없는 문서는 누가 건드리기 전까지
 * 그대로다. 이 스크립트가 함수의 handle 을 문서마다 직접 호출한다(같은 코드, 같은 결과).
 *
 * 사용:
 *   cd functions && npm ci && cd ..
 *   node scripts/backfill-reel-covers.js            # 드라이런: 대상 문서와 code 만 출력
 *   node scripts/backfill-reel-covers.js --commit   # 실제 캐싱
 *
 * 자격증명(둘 중 하나, 드라이런도 Firestore 읽기라 필요):
 *   a) gcloud auth application-default login  ← 프로젝트 권한이 있는 구글 계정으로. 키 파일 불필요.
 *      (이때 GOOGLE_APPLICATION_CREDENTIALS 는 비워 둘 것 — 설정돼 있으면 그 파일을 먼저 찾는다)
 *   b) GOOGLE_APPLICATION_CREDENTIALS=<serviceAccount.json>
 * Storage 버킷은 js/firebase-init.js 의 storageBucket 을 읽는다(--bucket 으로 덮어쓰기 가능).
 *
 * 진단 (Firebase 불필요):
 *   node scripts/backfill-reel-covers.js --debug <shortcode>
 *   → /embed/ 와 permalink 를 받아 요약(길이·title·로그인벽·CDN img 유무)과 후보 이미지 태그를 출력하고
 *     HTML 원문을 임시 폴더에 저장한다. 추출이 안 될 때 실제 응답을 보기 위한 것.
 */
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const COMMIT = process.argv.includes('--commit');
const bucketArg = (() => {
    const i = process.argv.indexOf('--bucket');
    return i >= 0 ? process.argv[i + 1] : null;
})();

function bucketFromWebConfig() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-init.js'), 'utf8');
    const m = src.match(/storageBucket:\s*["']([^"']+)["']/);
    return m ? m[1] : null;
}

async function debugCode(code) {
    const instaCover = require(path.join(__dirname, '..', 'functions', 'insta-cover'));
    const pure = require(path.join(__dirname, '..', 'functions', 'lib', 'pure'));
    const pages = [
        `https://www.instagram.com/reel/${code}/embed/`,
        `https://www.instagram.com/p/${code}/embed/captioned/`,
        `https://www.instagram.com/p/${code}/`,
    ];
    for (const page of pages) {
        console.log(`\n== ${page}`);
        let html;
        try {
            html = await instaCover._fetchText(page);
        } catch (e) {
            console.log('  요청 실패:', e && e.message);
            continue;
        }
        console.log('  ' + instaCover._describeHtml(html));
        console.log('  extractInstaPoster →', pure.extractInstaPoster(html));
        const imgs = [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0]).slice(0, 4);
        for (const tag of imgs) console.log('  img:', tag.replace(/\s+/g, ' ').slice(0, 220));
        const cdn = [...html.matchAll(/https?:(?:\\\/\\\/|\/\/)[a-z0-9.-]*cdninstagram\.com[^"'\s<>]{0,160}/gi)]
            .map((m) => m[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
        for (const u of cdn) console.log('  cdn:', u.slice(0, 200));
        const out = path.join(os.tmpdir(), `insta-${code}-${pages.indexOf(page)}.html`);
        fs.writeFileSync(out, html);
        console.log('  원문 저장:', out);
    }
}

async function main() {
    const dbg = process.argv.indexOf('--debug');
    if (dbg >= 0) {
        const code = process.argv[dbg + 1];
        if (!code) { console.error('--debug <shortcode>'); process.exit(1); }
        await debugCode(code);
        return;
    }
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFile && !fs.existsSync(keyFile)) {
        console.error(`GOOGLE_APPLICATION_CREDENTIALS 가 가리키는 파일이 없습니다: ${keyFile}`);
        console.error('gcloud 로그인으로 쓰려면 이 환경변수를 지우세요 (PowerShell: Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS).');
        process.exit(1);
    }
    console.log(keyFile ? `자격증명: 키 파일 ${keyFile}` : '자격증명: Application Default (gcloud auth application-default login)');
    const storageBucket = bucketArg || bucketFromWebConfig();
    if (!storageBucket) {
        console.error('Storage 버킷을 알 수 없습니다. --bucket <name> 을 주세요.');
        process.exit(1);
    }
    const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
    admin.initializeApp({ credential: admin.credential.applicationDefault(), storageBucket });
    const pure = require(path.join(__dirname, '..', 'functions', 'lib', 'pure'));
    const instaCover = require(path.join(__dirname, '..', 'functions', 'insta-cover'));
    const db = admin.firestore();

    let targets = 0, done = 0;
    for (const col of ['clubs', 'pickup_games']) {
        const snap = await db.collection(col).get();
        for (const doc of snap.docs) {
            const d = doc.data() || {};
            const urls = instaCover._reelUrls(d);
            if (!urls.length) continue;
            const covers = (d.insta_reel_covers && typeof d.insta_reel_covers === 'object') ? d.insta_reel_covers : {};
            const pending = [];
            for (const u of urls) {
                const code = pure.instaReelCode(u);
                if (code && !pure.isCachedCoverUrl(covers[code]) && !pending.includes(code)) pending.push(code);
            }
            if (!pending.length) continue;
            targets++;
            console.log(`${COMMIT ? '캐싱' : '대상'} ${col}/${doc.id} (${d.name || d.title || ''}) → ${pending.join(', ')}`);
            if (!COMMIT) continue;
            try {
                await instaCover._handle({ data: { after: doc } });
                done++;
            } catch (e) {
                console.error(`  실패 ${col}/${doc.id}:`, e && e.message);
            }
        }
    }
    console.log(`\n${COMMIT ? `완료: ${done}/${targets} 문서 처리` : `드라이런: ${targets} 문서가 대상. --commit 으로 실행`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
