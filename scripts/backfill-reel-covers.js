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
 *   GOOGLE_APPLICATION_CREDENTIALS=<serviceAccount.json> node scripts/backfill-reel-covers.js --commit
 *
 * Storage 버킷은 js/firebase-init.js 의 storageBucket 을 읽는다(--bucket 으로 덮어쓰기 가능).
 * 드라이런도 Firestore 읽기는 하므로 자격증명이 필요하다.
 */
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

async function main() {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error('GOOGLE_APPLICATION_CREDENTIALS 가 없습니다. 서비스 계정 키를 지정하세요.');
        process.exit(1);
    }
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
