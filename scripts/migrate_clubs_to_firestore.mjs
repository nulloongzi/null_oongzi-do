// scripts/migrate_clubs_to_firestore.mjs
//
// 정적 JSON(data/volleyball_clubs_kakao.json)의 클럽을 Firestore `clubs` 컬렉션으로
// 일괄 이관한다. 구글시트 파이프라인 폐기 후 Firestore를 단일 소스로 만들기 위한 일회성 스크립트.
//
// 인앱 등록(js/registration.js)과 동일한 스키마로 기록한다:
//   { id, name, target, is_verified, registered_by, address,
//     coordinates:{lat,lng}, schedule, schedule_raw:[{day,start,end}],
//     price, contact:{insta,link}, is_urgent, urgent_msg,
//     metadata:{created_at, updated_at, status, submitted_by, source} }
//
// 기존 md5 기반 id를 그대로 doc id로 사용 → 딥링크(?club=id)·북마크 호환 유지.
//
// ── 사용법 ──
//   npm i firebase-admin            # 최초 1회
//   # 서비스 계정 키는 Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
//   # 키 JSON 전체를 환경변수 FIREBASE_SA_JSON 에 넣거나(시크릿 권장),
//   # 또는 GOOGLE_APPLICATION_CREDENTIALS 로 키 파일 경로 지정.
//   OWNER_UID=<누룽지_uid> node scripts/migrate_clubs_to_firestore.mjs
//
// ── 옵션(환경변수) ──
//   FIREBASE_SA_JSON  서비스 계정 키 JSON 문자열(시크릿). 우선 사용.
//   GOOGLE_APPLICATION_CREDENTIALS  키 파일 경로(폴백).
//   OWNER_UID      (필수) 이관된 클럽의 소유자 uid. canModifyClub/급구 토글 권한 부여.
//   IS_VERIFIED    (기본 true)  큐레이션된 시드라 인증배지 부여. '0'/'false'면 미인증.
//   DRY_RUN        ('1'이면 쓰지 않고 미리보기만)
//   FORCE          ('1'이면 이미 존재하는 doc도 덮어씀. 기본은 기존 doc 건너뜀)
//   JSON_PATH      (기본 data/volleyball_clubs_kakao.json)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// firebase-admin은 실제 쓰기(!DRY_RUN) 시에만 lazy import → DRY_RUN 미리보기는 미설치로도 가능.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const OWNER_UID = process.env.OWNER_UID;
const IS_VERIFIED = !['0', 'false', 'no'].includes((process.env.IS_VERIFIED || 'true').toLowerCase());
const DRY_RUN = ['1', 'true', 'yes'].includes((process.env.DRY_RUN || '').toLowerCase());
const FORCE = ['1', 'true', 'yes'].includes((process.env.FORCE || '').toLowerCase());
const JSON_PATH = process.env.JSON_PATH || join(ROOT, 'data', 'volleyball_clubs_kakao.json');

if (!OWNER_UID) {
  console.error('❌ OWNER_UID 환경변수가 필요합니다 (이관된 클럽의 소유자 uid).');
  process.exit(1);
}

// "월 19:00~21:00 / 수 19:00~21:00" → [{day:'월',start:'19:00',end:'21:00'}, ...]
function parseScheduleRaw(text) {
  const out = [];
  if (!text) return out;
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  for (const seg of text.split(/\s*\/\s*/)) {
    const m = seg.match(/(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    for (const d of days) {
      if (seg.includes(d)) out.push({ day: d, start: m[1], end: m[2] });
    }
  }
  return out;
}

function buildDoc(c, ts) {
  return {
    id: c.id,
    name: c.name || '',
    target: c.target || '',
    is_verified: IS_VERIFIED,
    registered_by: OWNER_UID,
    address: c.address || '',
    coordinates: { lat: c.lat, lng: c.lng },
    schedule: c.schedule || '',
    schedule_raw: parseScheduleRaw(c.schedule),
    price: c.price || '',
    contact: { insta: c.insta || '', link: c.link || '' },
    is_urgent: !!c.is_urgent,
    urgent_msg: c.urgent_msg || '',
    metadata: {
      created_at: ts,
      updated_at: ts,
      status: 'approved',
      submitted_by: OWNER_UID,
      source: 'seed_migration'
    }
  };
}

async function main() {
  const raw = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  console.log(`📦 ${raw.length}개 클럽 로드: ${JSON_PATH}`);
  console.log(`   owner=${OWNER_UID} verified=${IS_VERIFIED} dryRun=${DRY_RUN} force=${FORCE}\n`);

  let admin = null, db = null, ts = 'SERVER_TIMESTAMP(미리보기)';
  if (!DRY_RUN) {
    admin = (await import('firebase-admin')).default;
    // 자격증명: 환경 시크릿 FIREBASE_SA_JSON(키 JSON 문자열) 우선,
    // 없으면 GOOGLE_APPLICATION_CREDENTIALS(파일 경로) 폴백.
    var credential;
    if (process.env.FIREBASE_SA_JSON) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SA_JSON));
    } else {
      credential = admin.credential.applicationDefault();
    }
    admin.initializeApp({
      credential: credential,
      projectId: process.env.GCLOUD_PROJECT || 'nulloongzi-do'
    });
    db = admin.firestore();
    ts = admin.firestore.FieldValue.serverTimestamp();
  }

  let created = 0, skipped = 0, overwritten = 0, invalid = 0;
  const batch = DRY_RUN ? null : db.batch();

  for (const c of raw) {
    if (!c.id || !c.name || typeof c.lat !== 'number' || typeof c.lng !== 'number') {
      console.warn(`⚠️  건너뜀(필수값 누락): ${c.name || '(이름없음)'} [${c.id || '-'}]`);
      invalid++;
      continue;
    }
    const ref = DRY_RUN ? null : db.collection('clubs').doc(String(c.id));
    if (!DRY_RUN && !FORCE) {
      const snap = await ref.get();
      if (snap.exists) {
        console.log(`↷ 이미 존재, 건너뜀: ${c.name} [${c.id}]`);
        skipped++;
        continue;
      }
    }
    const doc = buildDoc(c, ts);
    if (DRY_RUN) {
      console.log(`+ ${c.name} [${c.id}] target="${doc.target}" schedule_raw=${doc.schedule_raw.length}건`);
      created++;
    } else {
      batch.set(ref, doc);
      if (FORCE) overwritten++; else created++;
    }
  }

  if (!DRY_RUN) {
    await batch.commit();
  }

  console.log(`\n✅ 완료 — 신규 ${created} / 덮어씀 ${overwritten} / 건너뜀 ${skipped} / 무효 ${invalid}`);
  if (DRY_RUN) console.log('   (DRY_RUN: 실제 쓰기 없음. DRY_RUN 빼고 다시 실행하세요.)');
}

main().catch((e) => { console.error('❌ 마이그레이션 실패:', e); process.exit(1); });
