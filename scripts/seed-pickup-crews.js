#!/usr/bin/env node
/**
 * scripts/seed-pickup-crews.js — 공개 인스타 정보로 모은 픽업 크루를 `pickup_games`에 시딩한다.
 *
 * 배경(중요): 이 스크립트가 넣는 문서는 **크루 본인이 등록한 게 아니다.**
 * PHILOSOPHY 가치필터 #5는 원래 opt-in("공급은 클럽의 자발적 선택에서만")이지만,
 * 픽업 크루는 공개 계정이라는 판단으로 **opt-out(일단 게재 · 요청 시 삭제)**로 간다.
 * 그래서 모든 시딩 문서에 `source: 'curated'`를 박고, UI(pickup-detail.js)가 이를 보고
 * 출처 고지 + 삭제요청 통로를 띄운다. 이 필드를 빼면 옵트아웃 모델이 성립하지 않는다.
 *
 * 사용:
 *   GOOGLE_APPLICATION_CREDENTIALS=<serviceAccount.json> \
 *   node scripts/seed-pickup-crews.js data/pickup-crews.json [--commit]
 *
 * --commit 없이 실행하면 **드라이런**(쓰지 않고 계획만 출력). 실수로 프로덕션에
 * 쏟아붓는 사고를 막기 위한 기본값이다.
 *
 * 입력 JSON 형식 (배열):
 *   [
 *     {
 *       "title": "Seoul Sunday 6s",        // 필수
 *       "insta": "seoul6s",                // 인스타 핸들 (@ 없이). 권장
 *       "region": "서울",                   // 서울/경기/인천/강원/충청/전라/경상/제주
 *       "english_ok": true,
 *       "beginner_friendly": false,
 *       "sport": "6s",                     // 6s | 9s | mixed  (기본 6s)
 *       "level": "any",                    // beginner | intermediate | advanced | any
 *       "venue_name": "",                  // 선택
 *       "address": "",                     // 선택 — 있으면 좌표 없이도 지역 폴백 매칭
 *       "schedule_text": "일요일 저녁",       // 선택
 *       "fee_info": "",                    // 선택
 *       "contact_link": "",                // 선택 (오픈채팅/Meetup)
 *       "notes": ""                        // 선택
 *     }
 *   ]
 *
 * 재실행 안전: 문서 id를 `curated_<insta 또는 title 슬러그>`로 고정해 set(merge)하므로
 * 같은 파일을 두 번 돌려도 중복 문서가 생기지 않는다.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
// firebase-admin 은 --commit 일 때만 lazy require — 드라이런은 의존성 설치 없이 돌아야 한다.
// (루트에는 admin이 없고 functions/node_modules 에 있다)

const REGIONS = ['서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주'];
const SPORTS = ['6s', '9s', 'mixed'];
const LEVELS = ['beginner', 'intermediate', 'advanced', 'any'];

// 인스타 핸들 규칙: 영문/숫자/언더스코어/점 1~30자 (웹 sanitizeInstaHandle 와 동일)
const INSTA_RE = /^[A-Za-z0-9._]{1,30}$/;

function slug(s) {
    return String(s)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

/** 한 건 검증 → { ok, errors, doc } */
function validate(raw, i) {
    const errors = [];
    const title = String(raw.title || '').trim();
    if (!title) errors.push('title 없음');
    if (title.length > 80) errors.push('title 80자 초과');

    let insta = String(raw.insta || '').trim().replace(/^@/, '');
    if (insta && !INSTA_RE.test(insta)) {
        errors.push(`insta 형식 오류: "${insta}"`);
        insta = '';
    }

    const region = String(raw.region || '').trim();
    if (region && !REGIONS.includes(region)) errors.push(`region 값 오류: "${region}"`);

    const sport = String(raw.sport || '6s').trim();
    if (!SPORTS.includes(sport)) errors.push(`sport 값 오류: "${sport}"`);

    const level = String(raw.level || 'any').trim();
    if (!LEVELS.includes(level)) errors.push(`level 값 오류: "${level}"`);

    // 인스타도 단톡도 없으면 "연락할 방법"이 없다 — 발견 wedge로서 의미가 없으므로 거른다.
    const contactLink = String(raw.contact_link || '').trim();
    if (!insta && !contactLink) errors.push('insta·contact_link 둘 다 없음(연락 경로 없음)');

    const id = `curated_${slug(insta || title) || `row${i}`}`;

    const doc = {
        title,
        insta,
        region,
        sport,
        level,
        english_ok: !!raw.english_ok,
        beginner_friendly: !!raw.beginner_friendly,
        venue_name: String(raw.venue_name || '').trim(),
        address: String(raw.address || '').trim(),
        schedule: String(raw.schedule || '').trim(),
        schedule_raw: [],
        schedule_text: String(raw.schedule_text || '').trim(),
        fee_info: String(raw.fee_info || '').trim(),
        contact_link: contactLink,
        this_week: '',
        notes: String(raw.notes || '').trim(),
        insta_reel: '',
        insta_reels: [],
        // 좌표 없음 → 지도 마커 없이 목록에만. 룰이 null을 허용한다.
        coordinates: null,
        // 상시 노출(만료 없음). 시딩 항목은 이벤트가 아니라 상시 크루다.
        expire_at: null,
        source: 'curated',
    };

    return { ok: errors.length === 0, errors, id, doc };
}

async function main() {
    const [, , fileArg, ...rest] = process.argv;
    const commit = rest.includes('--commit');

    if (!fileArg) {
        console.error('사용: node scripts/seed-pickup-crews.js <크루목록.json> [--commit]');
        process.exit(1);
    }

    const filePath = path.resolve(fileArg);
    if (!fs.existsSync(filePath)) {
        console.error(`파일을 찾을 수 없습니다: ${filePath}`);
        process.exit(1);
    }

    let rows;
    try {
        rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`JSON 파싱 실패: ${e.message}`);
        process.exit(1);
    }
    if (!Array.isArray(rows)) {
        console.error('최상위가 배열이어야 합니다.');
        process.exit(1);
    }

    const results = rows.map(validate);
    const bad = results.filter((r) => !r.ok);
    const good = results.filter((r) => r.ok);

    // id 중복(같은 인스타 두 번) 검사 — set(merge)라 조용히 덮어써서 놓치기 쉽다.
    const seen = new Map();
    for (const r of good) {
        if (seen.has(r.id)) bad.push({ errors: [`id 중복: ${r.id} (${r.doc.title})`], ok: false });
        seen.set(r.id, true);
    }

    console.log(`총 ${rows.length}건 · 통과 ${good.length} · 오류 ${bad.length}`);
    for (const r of bad) {
        console.error(`  ✗ ${r.doc ? r.doc.title || '(제목없음)' : ''} — ${r.errors.join(', ')}`);
    }
    if (bad.length) {
        console.error('\n오류가 있어 중단합니다. 입력을 고친 뒤 다시 실행하세요.');
        process.exit(1);
    }

    for (const r of good) {
        const tags = [
            r.doc.region || '지역미지정',
            r.doc.english_ok ? 'EN' : '',
            r.doc.insta ? `@${r.doc.insta}` : r.doc.contact_link,
        ].filter(Boolean).join(' · ');
        console.log(`  · ${r.id}  ${r.doc.title}  [${tags}]`);
    }

    if (!commit) {
        console.log('\n드라이런입니다 — 아무것도 쓰지 않았습니다. 실제 반영은 --commit 을 붙이세요.');
        return;
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error('\nGOOGLE_APPLICATION_CREDENTIALS 가 없습니다. 서비스 계정 키를 지정하세요.');
        process.exit(1);
    }

    // functions/ 의 firebase-admin 을 재사용한다(루트에는 없음).
    const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const db = admin.firestore();
    const ownerUid = process.env.SEED_OWNER_UID || 'nulloongzi-curated';
    const now = admin.firestore.FieldValue.serverTimestamp();

    let written = 0;
    // 배치 500건 제한 — 목록이 커져도 안전하게 나눠 쓴다.
    for (let i = 0; i < good.length; i += 400) {
        const chunk = good.slice(i, i + 400);
        const batch = db.batch();
        for (const r of chunk) {
            batch.set(
                db.collection('pickup_games').doc(r.id),
                { ...r.doc, owner_uid: ownerUid, created_at: now, updated_at: now },
                { merge: true },
            );
        }
        await batch.commit();
        written += chunk.length;
        console.log(`  → ${written}/${good.length} 반영`);
    }

    console.log(`\n완료: ${written}건 반영. 삭제 요청이 오면 pickup_games/<id> 문서를 지우면 됩니다.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
