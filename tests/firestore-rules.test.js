// tests/firestore-rules.test.js
// Phase 1-1, 4의 Firestore rules 자동 검증.
// 실행: firebase emulators:exec --only firestore "node --test tests/firestore-rules.test.js"
//
// 시나리오:
// - PIN-3: 비owner가 clubs/{id} 직접 update 시도 → 거부
// - PR-1: 비로그인 users.get → 통과(공개 read 유지), email 필드 없음 가정
// - PR-2: 본인 users/{uid}/private/profile get → 통과
// - PR-3: 타인 users/{uid}/private/profile get → 거부
// - PR-5: admins list → 거부, 본인 get → 통과
// - 추가: users 공개 doc write에 email 포함 시도 → 거부 (hasOnly)
// - 추가: 신규 verification_requests create with attacker-controlled uid → 거부

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'nulloongzido-rules-test';
let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: 8080
        }
    });
    await testEnv.clearFirestore();

    // 사전 상태 시드: admins/{adminUid} 등록, 테스트 클럽 1개
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await db.collection('admins').doc('admin-uid').set({ added_at: new Date() });
        await db.collection('clubs').doc('club-1').set({
            name: 'Test Club',
            registered_by: 'owner-uid',
            is_verified: true,
            is_urgent: false,
            urgent_msg: ''
        });
        await db.collection('users').doc('owner-uid').set({
            nickname: '현미밥', suffix: 'a3k', full_nickname: '현미밥-a3k',
            color: '#fac710', created_at: new Date()
        });
        await db.collection('users').doc('owner-uid').collection('private').doc('profile').set({
            email: 'owner@example.com',
            bookmarks: [],
            customTeams: {}
        });
    });
});

after(async () => {
    if (testEnv) await testEnv.cleanup();
});

describe('Phase 1-1: clubs update (PIN 제거 → canModifyClub) 룰 강제', () => {
    test('PIN-3: 비owner는 clubs.is_urgent 업데이트 거부', async () => {
        const ctx = testEnv.authenticatedContext('attacker-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('clubs').doc('club-1').update({
            is_urgent: true,
            urgent_msg: 'hack'
        }));
    });

    test('owner는 자기 팀 is_urgent 업데이트 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(db.collection('clubs').doc('club-1').update({
            is_urgent: true,
            urgent_msg: '센터 1명 급구'
        }));
    });

    // 데이터 신뢰도 필드(guidelines.html 2-3): 소유자 수정 = 최종 확인 갱신.
    // 값 타입과 enum을 규칙에서 막지 못하면 잘못된 상태가 지도에 그대로 노출된다.
    test('owner는 last_verified_at(timestamp) 갱신 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(db.collection('clubs').doc('club-1').update({
            last_verified_at: new Date()
        }));
    });

    test('last_verified_at 이 timestamp 가 아니면 거부', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('clubs').doc('club-1').update({
            last_verified_at: '2026-09-03'
        }));
    });

    test('data_status 는 허용된 값만 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(db.collection('clubs').doc('club-1').update({
            data_status: 'needs_check'
        }));
        await assertFails(db.collection('clubs').doc('club-1').update({
            data_status: 'deleted'
        }));
    });

    test('admin은 모든 팀 업데이트 통과 (is_verified 포함)', async () => {
        const ctx = testEnv.authenticatedContext('admin-uid');
        const db = ctx.firestore();
        await assertSucceeds(db.collection('clubs').doc('club-1').update({
            is_verified: false
        }));
    });

    test('owner는 is_verified 값 변경 거부', async () => {
        // 직전 admin 테스트가 is_verified=false로 바꿔놨을 수 있으므로 현재 상태를 명시적으로 true로 시드 후 시도
        await testEnv.withSecurityRulesDisabled(async (sctx) => {
            await sctx.firestore().collection('clubs').doc('club-1').update({ is_verified: true });
        });
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('clubs').doc('club-1').update({
            is_verified: false   // true → false 로 실제 변경 시도 → 거부 기대
        }));
    });

    test('owner는 registered_by 변경 거부 (소유권 탈취 방지)', async () => {
        await testEnv.withSecurityRulesDisabled(async (sctx) => {
            await sctx.firestore().collection('clubs').doc('club-1')
                .update({ registered_by: 'owner-uid' });
        });
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('clubs').doc('club-1').update({
            registered_by: 'attacker-uid'
        }));
    });

    test('비로그인은 clubs read만 통과, write 거부', async () => {
        const ctx = testEnv.unauthenticatedContext();
        const db = ctx.firestore();
        await assertSucceeds(db.collection('clubs').doc('club-1').get());
        await assertFails(db.collection('clubs').doc('club-1').update({ is_urgent: true }));
    });
});

describe('Phase 5 (#8): clubs 필드 타입·길이 검증', () => {
    function validClub(uid) {
        return {
            name: 'New Club',
            target: '성인',
            address: '서울특별시 강남구',
            registered_by: uid,
            is_verified: false,
            coordinates: { lat: 37.5, lng: 127.0 },
            contact: { insta: 'club_insta', link: 'https://example.com' }
        };
    }

    test('정상 필드 create 통과', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        await assertSucceeds(db.collection('clubs').doc('new-ok').set(validClub('owner-uid')));
    });

    test('name 80자 초과 create 거부', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        const c = validClub('owner-uid');
        c.name = 'x'.repeat(81);
        await assertFails(db.collection('clubs').doc('new-longname').set(c));
    });

    test('name이 문자열이 아니면 create 거부', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        const c = validClub('owner-uid');
        c.name = 12345;
        await assertFails(db.collection('clubs').doc('new-numname').set(c));
    });

    test('address 250자 초과 create 거부', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        const c = validClub('owner-uid');
        c.address = 'a'.repeat(251);
        await assertFails(db.collection('clubs').doc('new-longaddr').set(c));
    });

    test('coordinates.lat가 숫자가 아니면 create 거부', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        const c = validClub('owner-uid');
        c.coordinates = { lat: 'abc', lng: 127.0 };
        await assertFails(db.collection('clubs').doc('new-badcoord').set(c));
    });

    test('contact.link 500자 초과 create 거부', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        const c = validClub('owner-uid');
        c.contact = { insta: 'x', link: 'https://e.com/' + 'a'.repeat(500) };
        await assertFails(db.collection('clubs').doc('new-longlink').set(c));
    });

    test('owner update에 urgent_msg 250자 초과 거부', async () => {
        const db = testEnv.authenticatedContext('owner-uid').firestore();
        await assertFails(db.collection('clubs').doc('club-1').update({
            is_urgent: true,
            urgent_msg: 'x'.repeat(251)
        }));
    });

    test('admin은 필드 검증 우회 (신뢰) — 긴 name도 통과', async () => {
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertSucceeds(db.collection('clubs').doc('club-1').update({
            name: 'z'.repeat(200)
        }));
    });
});

describe('Phase 4: users 공개/비공개 분리 룰', () => {
    test('PR-1: 비로그인도 users 공개 doc read 통과', async () => {
        const ctx = testEnv.unauthenticatedContext();
        const db = ctx.firestore();
        await assertSucceeds(db.collection('users').doc('owner-uid').get());
    });

    test('PR-2: 본인은 private/profile read 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(
            db.collection('users').doc('owner-uid')
                .collection('private').doc('profile').get()
        );
    });

    test('PR-3: 타인은 private/profile read 거부', async () => {
        const ctx = testEnv.authenticatedContext('attacker-uid');
        const db = ctx.firestore();
        await assertFails(
            db.collection('users').doc('owner-uid')
                .collection('private').doc('profile').get()
        );
    });

    test('타인은 private/profile write 거부', async () => {
        const ctx = testEnv.authenticatedContext('attacker-uid');
        const db = ctx.firestore();
        await assertFails(
            db.collection('users').doc('owner-uid')
                .collection('private').doc('profile').set({ email: 'hijacked' })
        );
    });

    test('본인은 private/profile write 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(
            db.collection('users').doc('owner-uid')
                .collection('private').doc('profile')
                .set({ email: 'owner@example.com', bookmarks: [], customTeams: {} })
        );
    });

    test('공개 doc에 email 필드 추가 시도 거부 (hasOnly)', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(
            db.collection('users').doc('owner-uid')
                .set({
                    nickname: '현미밥',
                    suffix: 'a3k',
                    full_nickname: '현미밥-a3k',
                    color: '#fac710',
                    created_at: new Date(),
                    email: 'leak@example.com' // 6번째 키 → 거부되어야 함
                })
        );
    });

    test('공개 doc에 5개 화이트리스트 필드만 set은 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(
            db.collection('users').doc('owner-uid')
                .set({
                    nickname: '백미',
                    suffix: 'b2k',
                    full_nickname: '백미-b2k',
                    color: '#fff8e1',
                    created_at: new Date()
                })
        );
    });

    test('다른 uid의 공개 doc write 거부', async () => {
        const ctx = testEnv.authenticatedContext('attacker-uid');
        const db = ctx.firestore();
        await assertFails(
            db.collection('users').doc('owner-uid')
                .set({ nickname: 'hijacked', suffix: 'xyz', full_nickname: 'hijacked-xyz', color: '#000', created_at: new Date() })
        );
    });
});

describe('예약 닉네임 — 누룽지·Nulloongzi·null_oongzi 는 공식 계정만', () => {
    const USER = (uid, full, nick) => ({
        nickname: nick || '현미밥', suffix: 'r1c', full_nickname: full, color: '#fac710', created_at: new Date()
    });
    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await db.collection('official_accounts').doc('official-uid').set({ note: '운영자 부계정' });
            await db.collection('users').doc('plain-uid').set(USER('plain-uid', '현미밥-p1a'));
            await db.collection('users').doc('legacy-uid').set(USER('legacy-uid', '누룽지2'));   // 규칙 전부터 쓰던 이름
            await db.collection('users').doc('admin-uid').set(USER('admin-uid', '현미밥-adm'));
            await db.collection('users').doc('official-uid').set(USER('official-uid', '현미밥-off'));
        });
    });
    const rename = (uid, name) => testEnv.authenticatedContext(uid).firestore()
        .collection('users').doc(uid).update({ full_nickname: name });

    for (const name of ['누룽지', '누룽지2', '누 룽 지', '진짜누룽지도', 'Nulloongzi', 'NULLOONGZI', 'null_oongzi', 'Null-Oongzi', 'nurungji', 'official nuloongzi']) {
        test(`일반 계정은 '${name}' 으로 못 바꾼다`, async () => { await assertFails(rename('plain-uid', name)); });
    }
    test('일반 계정도 보통 이름은 바꿀 수 있다', async () => {
        await assertSucceeds(rename('plain-uid', '배구하는현미'));
        await assertSucceeds(rename('plain-uid', '누룽'));   // 부분 일치가 아니면 통과
    });
    test('새 프로필 생성(set)에서도 예약 닉네임은 거부', async () => {
        const db = testEnv.authenticatedContext('new-uid').firestore();
        await assertFails(db.collection('users').doc('new-uid').set(USER('new-uid', 'nulloongzi-abc')));
        await assertFails(db.collection('users').doc('new-uid').set(USER('new-uid', '현미밥-abc', '누룽지')));
        await assertSucceeds(db.collection('users').doc('new-uid').set(USER('new-uid', '현미밥-abc')));
    });
    test('운영자(admins)와 공식 계정(official_accounts)은 쓸 수 있다', async () => {
        await assertSucceeds(rename('admin-uid', '누룽지'));
        await assertSucceeds(rename('official-uid', '누룽지 부계'));
    });
    test('이미 쓰던 예약 닉네임은 그대로 두고 다른 필드는 고칠 수 있다', async () => {
        const db = testEnv.authenticatedContext('legacy-uid').firestore();
        await assertSucceeds(db.collection('users').doc('legacy-uid').update({ color: '#ffffff' }));
        await assertSucceeds(db.collection('users').doc('legacy-uid').set(USER('legacy-uid', '누룽지2'), { merge: true }));
        // 다른 예약 이름으로 바꾸는 건 안 된다
        await assertFails(rename('legacy-uid', '누룽지3'));
        await assertSucceeds(rename('legacy-uid', '평범한밥'));
    });
    test('문자열이 아닌 닉네임은 거부', async () => {
        await assertFails(testEnv.authenticatedContext('plain-uid').firestore()
            .collection('users').doc('plain-uid').update({ full_nickname: 123 }));
    });
    test('official_accounts: 본인 get 만, 목록·쓰기 불가', async () => {
        const me = testEnv.authenticatedContext('official-uid').firestore();
        await assertSucceeds(me.collection('official_accounts').doc('official-uid').get());
        await assertFails(me.collection('official_accounts').get());
        await assertFails(testEnv.authenticatedContext('plain-uid').firestore()
            .collection('official_accounts').doc('official-uid').get());
        await assertFails(testEnv.authenticatedContext('plain-uid').firestore()
            .collection('official_accounts').doc('plain-uid').set({ note: 'me too' }));
    });
});

describe('Phase 4: admins list 차단 + 본인 get만 허용', () => {
    test('PR-5: 비관리자도 자기 uid에 대한 admins/get 통과 (false 반환)', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(db.collection('admins').doc('owner-uid').get());
    });

    test('PR-5: admins list (collection 전체 조회) 거부', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('admins').limit(10).get());
    });

    test('타인의 admins doc get 거부 (열람 차단)', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('admins').doc('admin-uid').get());
    });

    test('admin doc 쓰기는 admin 본인도 거부', async () => {
        const ctx = testEnv.authenticatedContext('admin-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('admins').doc('attacker-uid').set({}));
    });
});

describe('verification_requests 룰 (기존 룰, 회귀 방지)', () => {
    test('create with requested_by=self, status=pending 통과', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertSucceeds(db.collection('verification_requests').add({
            club_id: 'club-1',
            club_name: 'Test Club',
            requested_by: 'owner-uid',
            status: 'pending',
            requested_at: new Date()
        }));
    });

    test('create with requested_by 위조 거부', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('verification_requests').add({
            club_id: 'club-1',
            club_name: 'Test Club',
            requested_by: 'someone-else',
            status: 'pending',
            requested_at: new Date()
        }));
    });

    test('create with status=approved 거부 (스푸핑)', async () => {
        const ctx = testEnv.authenticatedContext('owner-uid');
        const db = ctx.firestore();
        await assertFails(db.collection('verification_requests').add({
            club_id: 'club-1',
            club_name: 'Test Club',
            requested_by: 'owner-uid',
            status: 'approved',
            requested_at: new Date()
        }));
    });

    test('client update 거부 (Cloud Function만 변경 가능)', async () => {
        const ctx = testEnv.authenticatedContext('admin-uid');
        const db = ctx.firestore();
        // 먼저 pending 요청 생성
        let docRef;
        await testEnv.withSecurityRulesDisabled(async (sctx) => {
            const sdb = sctx.firestore();
            docRef = await sdb.collection('verification_requests').add({
                club_id: 'club-1',
                club_name: 'Test Club',
                requested_by: 'owner-uid',
                status: 'pending'
            });
        });
        await assertFails(db.collection('verification_requests').doc(docRef.id).update({
            status: 'approved'
        }));
    });
});

describe('pickup_games 룰 (B: expire_at 검증 + 누구나/익명 등록 + 모더레이션 삭제)', () => {
    const validSpot = (owner, over = {}) => Object.assign({
        owner_uid: owner,
        title: '잠실 토요 6인제 픽업',
        sport: '6s', level: 'any', beginner_friendly: true, english_ok: true,
        venue_name: '잠실', address: '서울 송파구',
        coordinates: { lat: 37.5, lng: 127.0 },
        schedule: '토 19:00~22:00', schedule_raw: [], schedule_text: '',
        fee_info: '', contact_link: '', this_week: '', notes: '',
        expire_at: new Date(Date.now() + 30 * 86400000)   // 30일 후 (timestamp)
    }, over);

    test('owner_uid=self + expire_at(timestamp) 등록 통과', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-ok').set(validSpot('pk-owner')));
    });

    test('expire_at=null(상시) 등록 통과', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-null').set(validSpot('pk-owner', { expire_at: null })));
    });

    test('expire_at이 문자열이면 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-badexp').set(validSpot('pk-owner', { expire_at: '내일' })));
    });

    test('타인 owner_uid 등록 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-badowner').set(validSpot('someone-else')));
    });

    test('관리자는 타인 스팟 삭제 가능 (모더레이션)', async () => {
        await testEnv.withSecurityRulesDisabled(async (sctx) => {
            await sctx.firestore().collection('pickup_games').doc('pk-mod').set(validSpot('pk-owner'));
        });
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-mod').delete());
    });

    test('비소유자·비관리자 삭제 거부', async () => {
        await testEnv.withSecurityRulesDisabled(async (sctx) => {
            await sctx.firestore().collection('pickup_games').doc('pk-del').set(validSpot('pk-owner'));
        });
        const db = testEnv.authenticatedContext('stranger').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-del').delete());
    });

    // ── 좌표 선택 + 인스타/지역 (장소가 유동적인 크루) ──
    test('coordinates 없이 등록 통과 (지도에 안 뜨고 목록에만)', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        const spot = validSpot('pk-owner');
        delete spot.coordinates;
        delete spot.address;
        spot.region = '서울';
        await assertSucceeds(db.collection('pickup_games').doc('pk-nocoord').set(spot));
    });

    test('coordinates=null 명시도 통과 (클라이언트가 좌표를 지울 수 있어야 함)', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-nullcoord')
            .set(validSpot('pk-owner', { coordinates: null })));
    });

    test('coordinates가 map이지만 lat/lng 없으면 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-badcoord')
            .set(validSpot('pk-owner', { coordinates: { foo: 1 } })));
    });

    test('insta 핸들 등록 통과', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-insta')
            .set(validSpot('pk-owner', { insta: 'nulloongzi' })));
    });

    test('insta가 80자 초과면 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-longinsta')
            .set(validSpot('pk-owner', { insta: 'a'.repeat(81) })));
    });

    test('insta가 문자열이 아니면 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-numinsta')
            .set(validSpot('pk-owner', { insta: 12345 })));
    });

    test("source='curated' 등록 통과 (시딩 항목 표시 → UI가 삭제요청 통로를 띄운다)", async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-curated')
            .set(validSpot('pk-owner', { source: 'curated' })));
    });

    test('source가 20자 초과면 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertFails(db.collection('pickup_games').doc('pk-longsource')
            .set(validSpot('pk-owner', { source: 'x'.repeat(21) })));
    });

    test('region 등록 통과 / 20자 초과 거부', async () => {
        const db = testEnv.authenticatedContext('pk-owner').firestore();
        await assertSucceeds(db.collection('pickup_games').doc('pk-region')
            .set(validSpot('pk-owner', { region: '서울' })));
        await assertFails(db.collection('pickup_games').doc('pk-longregion')
            .set(validSpot('pk-owner', { region: '가'.repeat(21) })));
    });
});

// reports: 무로그인(익명) 신고를 열되 스팸 문은 좁힌다. 열어둔 만큼 검증이 촘촘해야
// 하므로 화이트리스트·enum·길이·읽기차단을 전부 지킨다.
describe('reports 룰 (제3자 신고: 익명 허용 + 스팸 방어 + 읽기 차단)', () => {
    const validReport = (uid, over = {}) => Object.assign({
        kind: 'club',
        target_id: 'club-1',
        target_name: 'Test Club',
        reason: 'wrong_info',
        detail: '연습 요일이 바뀌었어요',
        reporter_uid: uid,
        status: 'open',
        created_at: new Date()
    }, over);

    test('익명 인증 사용자의 신고 통과 (로그인 벽 없음이 핵심)', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertSucceeds(db.collection('reports').doc('r-anon').set(validReport('anon-reporter')));
    });

    test('픽업 대상 신고도 통과', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertSucceeds(db.collection('reports').doc('r-pickup')
            .set(validReport('anon-reporter', { kind: 'pickup', target_id: 'pk-1' })));
    });

    test('비로그인(uid 없음) 신고는 거부 — 익명 인증조차 없으면 막는다', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(db.collection('reports').doc('r-noauth').set(validReport('nobody')));
    });

    test('reporter_uid 위조 거부', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-forge')
            .set(validReport('someone-else')));
    });

    test("status='resolved' 로 생성 거부 (처리완료 스푸핑)", async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-spoof')
            .set(validReport('anon-reporter', { status: 'resolved' })));
    });

    test('사유 enum 밖의 값 거부', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-reason')
            .set(validReport('anon-reporter', { reason: 'whatever' })));
    });

    test('kind enum 밖의 값 거부', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-kind')
            .set(validReport('anon-reporter', { kind: 'user' })));
    });

    test('detail 500자 초과 거부 (본문이 저장소가 되지 않게)', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-long')
            .set(validReport('anon-reporter', { detail: '가'.repeat(501) })));
    });

    test('화이트리스트 밖 필드 거부 (문서 비대화 차단)', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-extra')
            .set(validReport('anon-reporter', { payload: 'x'.repeat(400) })));
    });

    test('target_id 빈 문자열 거부', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-empty')
            .set(validReport('anon-reporter', { target_id: '' })));
    });

    test('신고자 본인도 읽을 수 없다 (누가 누구를 신고했는지 비공개)', async () => {
        const db = testEnv.authenticatedContext('anon-reporter').firestore();
        await assertFails(db.collection('reports').doc('r-anon').get());
    });

    test('관리자는 읽을 수 있다', async () => {
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertSucceeds(db.collection('reports').doc('r-anon').get());
    });

    test('클라이언트 update/delete 거부 (처리는 Cloud Function만)', async () => {
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertFails(db.collection('reports').doc('r-anon').update({ status: 'resolved' }));
        await assertFails(db.collection('reports').doc('r-anon').delete());
    });
});

// club_claims: 구글시트 접수 때 받은 팀 담당자 메일. clubs 가 allow read: if true 라
// 거기 두면 전 세계에 공개된다. 별도 컬렉션으로 빼고 통째로 잠갔는지 고정한다 —
// 여기가 뚫리면 51개 팀 담당자 메일이 그대로 새어나간다.
describe('club_claims / club_claim_requests 룰 (담당자 메일 비공개 + 승인은 서버만)', () => {
    test('club_claims: 관리자조차 클라이언트로는 못 읽는다 (Functions 전용)', async () => {
        for (const uid of ['some-user', 'admin-uid']) {
            const db = testEnv.authenticatedContext(uid).firestore();
            await assertFails(db.collection('club_claims').doc('club-1').get());
        }
    });

    test('club_claims: 쓰기도 전부 거부', async () => {
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertFails(db.collection('club_claims').doc('club-1')
            .set({ email: 'owner@example.com' }));
    });

    test('club_claims: 미로그인도 당연히 거부', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(db.collection('club_claims').doc('club-1').get());
    });

    // 요청 문서엔 가린 메일만 들어가지만, 누가 어느 팀을 노렸는지도 정보다.
    test('club_claim_requests: 일반 사용자는 못 읽는다', async () => {
        const db = testEnv.authenticatedContext('some-user').firestore();
        await assertFails(db.collection('club_claim_requests').doc('req-1').get());
    });

    test('club_claim_requests: 관리자는 읽을 수 있다 (이력 확인)', async () => {
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertSucceeds(db.collection('club_claim_requests').doc('req-1').get());
    });

    // 여기가 열리면 아무나 자기 앞으로 승인된 요청을 써넣고 팀을 가져갈 수 있다.
    test('club_claim_requests: 클라이언트 쓰기는 관리자도 거부', async () => {
        for (const uid of ['some-user', 'admin-uid']) {
            const db = testEnv.authenticatedContext(uid).firestore();
            await assertFails(db.collection('club_claim_requests').doc('req-x')
                .set({ club_id: 'club-1', uid: uid, status: 'approved' }));
        }
    });
});

describe('팀 관리자(admins) 룰 — 정원 3명 · 명단은 서버만', () => {
    const CLUB = 'club-admins';        // admins: ['a1','a2']
    const LEGACY = 'club-legacy';      // registered_by 만 있는 구 문서
    const FULL = 'club-full';          // admins 3명

    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await db.collection('clubs').doc(CLUB).set({
                name: '관리자팀', admins: ['a1', 'a2'], registered_by: 'a1', is_verified: true
            });
            await db.collection('clubs').doc(LEGACY).set({
                name: '구문서팀', registered_by: 'owner-uid', is_verified: true
            });
            await db.collection('clubs').doc(FULL).set({
                name: '정원팀', admins: ['a1', 'a2', 'a3'], registered_by: 'a1', is_verified: true
            });
            // 미인증 팀 — 배지를 스스로 올릴 수 있는지 보려면 false 에서 출발해야 한다.
            await db.collection('clubs').doc('club-unverified').set({
                name: '미인증팀', admins: ['a1'], registered_by: 'a1', is_verified: false
            });
        });
    });

    function as(uid) { return testEnv.authenticatedContext(uid).firestore(); }

    test('명단에 있으면 내용을 고칠 수 있다', async () => {
        await assertSucceeds(as('a2').collection('clubs').doc(CLUB).update({ price: '월 3만원' }));
    });

    test('명단에 없으면 거부', async () => {
        await assertFails(as('stranger').collection('clubs').doc(CLUB).update({ price: '월 1원' }));
    });

    // admins 가 없던 시절 문서. 마이그레이션을 안 돌려도 기존 소유자는
    // 계속 자기 팀을 고칠 수 있어야 한다.
    test('구 문서는 registered_by 가 그대로 관리자', async () => {
        await assertSucceeds(as('owner-uid').collection('clubs').doc(LEGACY).update({ price: '월 2만원' }));
        await assertFails(as('a1').collection('clubs').doc(LEGACY).update({ price: '월 2만원' }));
    });

    // 여기가 이 기능의 급소다. 클라이언트가 admins 를 쓸 수 있으면 자기 uid 를
    // 끼워넣어 아무 팀이나 가져갈 수 있고, 승인 절차가 통째로 무의미해진다.
    test('관리자라도 admins 를 직접 못 바꾼다', async () => {
        await assertFails(as('a1').collection('clubs').doc(CLUB).update({ admins: ['a1', 'a2', 'intruder'] }));
    });

    test('남이 admins 에 자기를 끼워넣는 것도 거부', async () => {
        await assertFails(as('intruder').collection('clubs').doc(CLUB).update({ admins: ['intruder'] }));
    });

    // 인증 배지는 심사를 거친 값이다. 팀 관리자가 스스로 붙일 수 있으면
    // 인증 절차 자체가 장식이 된다.
    test('관리자라도 is_verified 를 스스로 올릴 수 없다', async () => {
        const club = as('a1').collection('clubs').doc('club-unverified');
        await assertFails(club.update({ is_verified: true }));
        await assertSucceeds(club.update({ price: '월 3만원' }));   // 내용 수정은 된다
    });

    test('운영자는 admins 를 바꿀 수 있다', async () => {
        await assertSucceeds(as('admin-uid').collection('clubs').doc(CLUB).update({ admins: ['a1', 'a2', 'a3'] }));
    });

    test('정원 3명을 넘는 배열은 운영자도 못 쓴다', async () => {
        await assertFails(as('admin-uid').collection('clubs').doc(FULL).update({ admins: ['a1', 'a2', 'a3', 'a4'] }));
    });

    test('관리자는 팀을 삭제할 수 있고, 남은 거부', async () => {
        await assertFails(as('stranger').collection('clubs').doc(CLUB).delete());
        await assertSucceeds(as('a2').collection('clubs').doc(CLUB).delete());
    });

    test('새 팀은 본인 혼자만 admins 에 넣을 수 있다', async () => {
        // 문서 id 는 이 파일 안에서 유일해야 한다 — 이미 있는 id 로 set 하면
        // create 가 아니라 update 로 평가돼 엉뚱한 이유로 거부된다.
        const ok = as('newbie').collection('clubs').doc('admins-new-ok');
        await assertSucceeds(ok.set({
            name: '새팀', registered_by: 'newbie', admins: ['newbie'], is_verified: false
        }));
        const bad = as('newbie').collection('clubs').doc('admins-new-bad');
        await assertFails(bad.set({
            name: '새팀2', registered_by: 'newbie', admins: ['newbie', 'someone'], is_verified: false
        }));
    });
});

describe('급구(is_urgent) — 인증된 팀 관리자만 켠다', () => {
    function as(uid) { return testEnv.authenticatedContext(uid).firestore(); }

    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await db.collection('clubs').doc('urg-unverified').set({
                name: '미인증급구팀', admins: ['m1'], registered_by: 'm1', is_verified: false,
                is_urgent: false, urgent_msg: ''
            });
            // 인증이 풀렸는데 예전 급구가 켜진 채 남은 팀
            await db.collection('clubs').doc('urg-unverified-on').set({
                name: '예전급구팀', admins: ['m1'], registered_by: 'm1', is_verified: false,
                is_urgent: true, urgent_msg: '예전 급구'
            });
            await db.collection('clubs').doc('urg-verified').set({
                name: '인증급구팀', admins: ['m1', 'm2'], registered_by: 'm1', is_verified: true,
                is_urgent: false, urgent_msg: ''
            });
        });
    });

    test('미인증 팀 관리자는 급구를 켤 수 없다', async () => {
        await assertFails(as('m1').collection('clubs').doc('urg-unverified')
            .update({ is_urgent: true, urgent_msg: '센터 급구' }));
    });

    test('미인증 팀이라도 켜진 급구를 끌 수는 있다', async () => {
        const ref = as('m1').collection('clubs').doc('urg-unverified-on');
        // 그대로 둔 채 다른 필드 수정은 막지 않는다
        await assertSucceeds(ref.update({ price: '월 1만원' }));
        // 문구를 바꾸는 건 새로 켜는 것과 같다
        await assertFails(ref.update({ urgent_msg: '새 문구' }));
        await assertSucceeds(ref.update({ is_urgent: false, urgent_msg: '' }));
    });

    test('인증 팀의 공동 관리자(admins[])는 켤 수 있다', async () => {
        await assertSucceeds(as('m2').collection('clubs').doc('urg-verified')
            .update({ is_urgent: true, urgent_msg: '레프트 1명 급구' }));
        await assertSucceeds(as('m2').collection('clubs').doc('urg-verified')
            .update({ is_urgent: false, urgent_msg: '' }));
    });

    test('켤 때 문구가 비었거나 공백뿐이면 거부', async () => {
        const ref = as('m1').collection('clubs').doc('urg-verified');
        await assertFails(ref.update({ is_urgent: true, urgent_msg: '' }));
        await assertFails(ref.update({ is_urgent: true, urgent_msg: '   ' }));
        await assertFails(ref.update({ is_urgent: true }));
    });

    test('is_urgent 가 bool 이 아니면 거부', async () => {
        const ref = as('m1').collection('clubs').doc('urg-verified');
        await assertFails(ref.update({ is_urgent: 'true', urgent_msg: '급구' }));
        await assertFails(ref.update({ is_urgent: 1, urgent_msg: '급구' }));
    });

    test('남은 인증 팀이라도 켤 수 없다', async () => {
        await assertFails(as('stranger').collection('clubs').doc('urg-verified')
            .update({ is_urgent: true, urgent_msg: '급구' }));
    });

    test('새 팀은 급구를 켠 채 만들 수 없다', async () => {
        const club = (id) => ({ name: id, registered_by: 'newbie2', is_verified: false });
        await assertFails(as('newbie2').collection('clubs').doc('urg-new-on')
            .set(Object.assign(club('a'), { is_urgent: true, urgent_msg: '급구' })));
        await assertFails(as('newbie2').collection('clubs').doc('urg-new-str')
            .set(Object.assign(club('b'), { is_urgent: 'false' })));
        await assertSucceeds(as('newbie2').collection('clubs').doc('urg-new-off')
            .set(Object.assign(club('c'), { is_urgent: false, urgent_msg: '' })));
    });

    test('운영자 경로는 그대로 — 미인증 팀도 켤 수 있다', async () => {
        await assertSucceeds(as('admin-uid').collection('clubs').doc('urg-unverified')
            .update({ is_urgent: true, urgent_msg: '운영자 공지' }));
    });
});

describe('빈 admins 배열은 관리자 없음 — registered_by 로 되살아나지 않는다', () => {
    function as(uid) { return testEnv.authenticatedContext(uid).firestore(); }
    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('clubs').doc('club-emptied').set({
                name: '관리자떠난팀', admins: [], registered_by: 'left-uid', is_verified: true
            });
        });
    });
    test('마지막 관리자가 빠진 팀은 등록자도 못 고친다', async () => {
        await assertFails(as('left-uid').collection('clubs').doc('club-emptied').update({ price: '월 1원' }));
    });
});

describe('club_admin_requests 룰 (관리자 신청)', () => {
    function as(uid) { return testEnv.authenticatedContext(uid).firestore(); }
    const PHOTO = 'https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/admin_request_photos%2Freq-1%2Fp.jpg?alt=media&token=t';
    const base = (uid) => ({
        club_id: 'club-1', club_name: '테스트팀',
        photo_url: PHOTO,
        requested_by: uid, requested_at: new Date(), status: 'pending'
    });

    test('본인 uid 로 pending 생성은 통과', async () => {
        await assertSucceeds(as('req-1').collection('club_admin_requests').doc('r1').set(base('req-1')));
    });

    test('남의 uid 를 신청자로 쓰면 거부', async () => {
        await assertFails(as('req-1').collection('club_admin_requests').doc('r2').set(base('victim')));
    });

    // 신청자가 자기 요청을 approved 로 만들 수 있으면 승인 절차가 무의미하다.
    test('처음부터 approved 로 만들 수 없다', async () => {
        const d = base('req-1'); d.status = 'approved';
        await assertFails(as('req-1').collection('club_admin_requests').doc('r3').set(d));
    });

    test('나중에 status 를 고치는 것도 거부 (승인은 서버만)', async () => {
        await assertFails(as('req-1').collection('club_admin_requests').doc('r1').update({ status: 'approved' }));
    });

    test('사진 없이 신청할 수 없다', async () => {
        const d = base('req-1'); delete d.photo_url;
        await assertFails(as('req-1').collection('club_admin_requests').doc('r4').set(d));
    });

    test('화이트리스트 밖 필드는 거부 (문서 비대화 방지)', async () => {
        const d = base('req-1'); d.note = 'x'.repeat(100);
        await assertFails(as('req-1').collection('club_admin_requests').doc('r5').set(d));
    });

    // 심사 결과 필드는 서버만 쓴다. 만들 때 끼워 넣을 수 있으면 신청자가
    // '거절 사유'를 미리 박거나 심사 시각을 꾸밀 수 있다.
    test('만들 때 reviewed_at · reject_reason 은 못 넣는다', async () => {
        const d1 = base('req-1'); d1.reviewed_at = null;
        await assertFails(as('req-1').collection('club_admin_requests').doc('r6').set(d1));
        const d2 = base('req-1'); d2.reject_reason = 'full';
        await assertFails(as('req-1').collection('club_admin_requests').doc('r7').set(d2));
    });

    // 승인되면 그 uid 가 팀 관리자가 된다. 익명 계정은 기기를 바꾸면 사라진다.
    test('익명 인증으로는 신청할 수 없다', async () => {
        const anon = testEnv.authenticatedContext('anon-req', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
        await assertFails(anon.collection('club_admin_requests').doc('r8').set(base('anon-req')));
    });

    // 바깥 URL 을 받으면 챗봇 카드가 아무 이미지나 띄우고 운영자가 그 링크를 누른다.
    test('사진은 우리 Storage 다운로드 URL 만 받는다', async () => {
        const bad = ['https://example.com/p.jpg', 'http://firebasestorage.googleapis.com/v0/b/x',
            'https://firebasestorage.googleapis.com.evil.com/x', 'javascript:alert(1)'];
        for (let i = 0; i < bad.length; i++) {
            const d = base('req-1'); d.photo_url = bad[i];
            await assertFails(as('req-1').collection('club_admin_requests').doc('rb' + i).set(d), bad[i]);
        }
    });

    test('신청자 본인과 운영자만 읽는다', async () => {
        await assertSucceeds(as('req-1').collection('club_admin_requests').doc('r1').get());
        await assertSucceeds(as('admin-uid').collection('club_admin_requests').doc('r1').get());
        await assertFails(as('nosy').collection('club_admin_requests').doc('r1').get());
    });
});

describe('위치 공개 수준 — 대략만 고른 팀은 정확한 좌표를 저장할 수 없다', () => {
    // clubs 는 allow read: if true 다. 화면에서만 흐리면 Firestore 를 직접 읽어
    // 정확한 값이 그대로 나온다. 그래서 저장 단계에서 막는 게 유일하게 의미 있다.
    const EXACT = { lat: 37.6051234, lng: 127.0573891 };
    const COARSE = { lat: Math.round(37.6051234 * 200) / 200, lng: Math.round(127.0573891 * 200) / 200 };

    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('clubs').doc('loc-1').set({
                name: '위치팀', admins: ['loc-owner'], registered_by: 'loc-owner', is_verified: false
            });
        });
    });
    function as(uid) { return testEnv.authenticatedContext(uid).firestore(); }
    const club = () => as('loc-owner').collection('clubs').doc('loc-1');

    test('area 인데 정확한 좌표면 거부', async () => {
        await assertFails(club().update({ location_precision: 'area', coordinates: EXACT }));
    });

    test('area + 격자에 맞춘 좌표면 통과', async () => {
        await assertSucceeds(club().update({ location_precision: 'area', coordinates: COARSE }));
    });

    // 여기가 진짜 급소: 이미 area 인 팀이 좌표만 정확한 값으로 덮어쓰면
    // 검사를 빠져나갈 수 있다(문서에는 area 가 그대로 남아 있으므로).
    test('이미 area 인 팀이 좌표만 정확한 값으로 바꾸는 것도 거부', async () => {
        // 앞 테스트 결과에 기대지 않고 직접 심는다 — 체이닝하면 앞이 깨졌을 때
        // 이 테스트가 엉뚱한 이유로 통과해버린다.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('clubs').doc('loc-3').set({
                name: '이미area', admins: ['loc-owner'], registered_by: 'loc-owner',
                is_verified: false, location_precision: 'area', coordinates: COARSE
            });
        });
        await assertFails(as('loc-owner').collection('clubs').doc('loc-3').update({ coordinates: EXACT }));
        await assertSucceeds(as('loc-owner').collection('clubs').doc('loc-3').update({ price: '월 3만원' }));
    });

    test('exact 는 정확한 좌표 그대로 통과', async () => {
        await assertSucceeds(club().update({ location_precision: 'exact', coordinates: EXACT }));
    });

    test('모르는 값은 거부 — 오타가 조용히 exact 로 떨어지면 안 된다', async () => {
        await assertFails(club().update({ location_precision: 'rough' }));
    });

    // 운영자 경로(isAdmin)가 clubFieldsValid 를 건너뛰므로 콘솔에서 뚫릴 수 있다.
    test('운영자도 area 팀에 정확한 좌표를 넣을 수 없다', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('clubs').doc('loc-2').set({
                name: '위치팀2', admins: ['x'], is_verified: false, location_precision: 'area'
            });
        });
        await assertFails(as('admin-uid').collection('clubs').doc('loc-2').update({ coordinates: EXACT }));
    });
});

describe('밥친구 — 초대코드 · 신청 · 수락', () => {
    const A = 'fa-uid', B = 'fb-uid', C = 'fc-uid';
    const PAIR = [A, B].sort().join('_');
    const as = (uid) => testEnv.authenticatedContext(uid).firestore();
    const anon = () => testEnv.authenticatedContext('anon-uid', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    // 룰이 created_at == request.time 을 요구한다 → 서버 시각으로 써야 통과
    const ts = () => require('firebase/compat/app').default.firestore.FieldValue.serverTimestamp();

    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await db.collection('invite_codes').doc('BBBB22').set({ uid: B, created_at: new Date() });
            await db.collection('invite_codes').doc('CCCC33').set({ uid: C, created_at: new Date() });
            // 이미 친구인 쌍 (A-C)
            const ac = [A, C].sort();
            await db.collection('friendships').doc(ac.join('_')).set({
                members: ac, requested_by: A, requested_to: C, status: 'accepted',
                code: 'CCCC33', created_at: new Date(), accepted_at: new Date()
            });
        });
    });

    function req(from, to, code, over = {}) {
        const m = [from, to].sort();
        return Object.assign({
            members: m, requested_by: from, requested_to: to, status: 'pending', code, created_at: ts()
        }, over);
    }

    // ── 초대코드 ──
    test('내 코드 만들기: 형식 맞고 uid=나 → 통과', async () => {
        await assertSucceeds(as(A).collection('invite_codes').doc('AAAA22').set({ uid: A, created_at: ts() }));
    });
    test('남의 uid 로 코드 만들기 거부 (남 이름으로 신청을 받게 하는 위조)', async () => {
        await assertFails(as(A).collection('invite_codes').doc('AAAA23').set({ uid: B, created_at: ts() }));
    });
    test('형식 밖 코드 거부 (소문자·0·O·1·I·길이)', async () => {
        for (const bad of ['aaaa22', 'AAAA0O', 'AAAA1I', 'AAAAA', 'AAAAAAA']) {
            await assertFails(as(A).collection('invite_codes').doc(bad).set({ uid: A, created_at: ts() }));
        }
    });
    test('이미 있는 코드는 덮어쓸 수 없다 (가로채기 방지)', async () => {
        await assertFails(as(A).collection('invite_codes').doc('BBBB22').set({ uid: A, created_at: ts() }));
    });
    test('코드로 주인 찾기는 되고, 목록 긁기는 안 된다', async () => {
        await assertSucceeds(as(A).collection('invite_codes').doc('BBBB22').get());
        await assertFails(as(A).collection('invite_codes').get());
    });
    test('익명 사용자는 코드를 못 본다', async () => {
        await assertFails(anon().collection('invite_codes').doc('BBBB22').get());
    });
    test('코드 삭제는 주인만', async () => {
        await assertFails(as(A).collection('invite_codes').doc('CCCC33').delete());
    });

    // ── 신청 ──
    test('상대의 현재 코드를 들고 신청 → 통과', async () => {
        await assertSucceeds(as(A).collection('friendships').doc(PAIR).set(req(A, B, 'BBBB22')));
    });
    test('코드가 상대 것이 아니면 거부 (uid 만 알아서는 못 건다)', async () => {
        const ab2 = [A, 'fd-uid'].sort().join('_');
        await assertFails(as(A).collection('friendships').doc(ab2).set(req(A, 'fd-uid', 'BBBB22')));
    });
    test('남을 신청자로 꾸미기 거부', async () => {
        const bc = [B, C].sort().join('_');
        await assertFails(as(A).collection('friendships').doc(bc).set(req(B, C, 'CCCC33')));
    });
    test('처음부터 accepted 로 만들기 거부', async () => {
        const ax = [A, 'fx-uid'].sort().join('_');
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('invite_codes').doc('XXXX44').set({ uid: 'fx-uid', created_at: new Date() });
        });
        await assertFails(as(A).collection('friendships').doc(ax).set(req(A, 'fx-uid', 'XXXX44', { status: 'accepted' })));
    });
    test('문서 id 가 쌍과 다르면 거부', async () => {
        await assertFails(as(A).collection('friendships').doc('wrong_id').set(req(A, B, 'BBBB22')));
    });
    test('익명 사용자는 신청 못 한다', async () => {
        const an = ['anon-uid', B].sort().join('_');
        await assertFails(anon().collection('friendships').doc(an).set(req('anon-uid', B, 'BBBB22')));
    });

    // ── 읽기 ──
    test('당사자는 읽고, 제3자는 못 읽는다', async () => {
        await assertSucceeds(as(B).collection('friendships').doc(PAIR).get());
        await assertFails(as(C).collection('friendships').doc(PAIR).get());
    });
    test('내가 들어간 쌍의 없는 문서는 get 으로 확인할 수 있다', async () => {
        const ae = [A, 'fe-uid'].sort().join('_');
        await assertSucceeds(as(A).collection('friendships').doc(ae).get());
    });
    test('내 목록 조회(array-contains 나)는 되고, 전체 목록은 안 된다', async () => {
        await assertSucceeds(as(A).collection('friendships').where('members', 'array-contains', A).get());
        await assertFails(as(A).collection('friendships').get());
    });

    // ── 수락 ──
    test('신청한 쪽은 스스로 수락 못 한다', async () => {
        await assertFails(as(A).collection('friendships').doc(PAIR).update({ status: 'accepted', accepted_at: ts() }));
    });
    test('받은 쪽이 수락하면서 다른 필드는 못 바꾼다', async () => {
        await assertFails(as(B).collection('friendships').doc(PAIR).update({ status: 'accepted', accepted_at: ts(), code: 'ZZZZ99' }));
    });
    test('받은 쪽 수락 → 통과', async () => {
        await assertSucceeds(as(B).collection('friendships').doc(PAIR).update({ status: 'accepted', accepted_at: ts() }));
    });
    test('수락된 관계를 pending 으로 되돌리기 거부', async () => {
        await assertFails(as(B).collection('friendships').doc(PAIR).update({ status: 'pending' }));
    });

    // ── 끊기 ──
    test('제3자는 끊을 수 없고, 당사자는 조용히 끊는다', async () => {
        await assertFails(as(C).collection('friendships').doc(PAIR).delete());
        await assertSucceeds(as(A).collection('friendships').doc(PAIR).delete());
    });
});

describe('밥친구 2단계 — 친구에게 보이는 도시락 사본', () => {
    const A = 'sa-uid', B = 'sb-uid', P = 'sp-uid', X = 'sx-uid';
    const as = (uid) => testEnv.authenticatedContext(uid).firestore();
    const ts = () => require('firebase/compat/app').default.firestore.FieldValue.serverTimestamp();
    const shared = (uid) => (db) => db.collection('users').doc(uid).collection('shared').doc('lunchbox');
    const good = () => ({ teams: ['club-1', 'club-2'], custom: [{ name: '회사팀', schedule: '수 19:00-21:00' }], hide_all: false, updated_at: ts() });

    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            const ab = [A, B].sort(), ap = [A, P].sort();
            await db.collection('friendships').doc(ab.join('_')).set({ members: ab, requested_by: A, requested_to: B, status: 'accepted', code: 'X', created_at: new Date() });
            await db.collection('friendships').doc(ap.join('_')).set({ members: ap, requested_by: P, requested_to: A, status: 'pending', code: 'X', created_at: new Date() });
        });
    });

    test('본인은 쓰고 읽는다', async () => {
        await assertSucceeds(shared(A)(as(A)).set(good()));
        await assertSucceeds(shared(A)(as(A)).get());
    });
    test('수락된 밥친구는 읽는다', async () => {
        await assertSucceeds(shared(A)(as(B)).get());
    });
    test('신청 중인 사이·모르는 사람은 못 읽는다', async () => {
        await assertFails(shared(A)(as(P)).get());
        await assertFails(shared(A)(as(X)).get());
    });
    test('남의 사본은 못 쓴다', async () => {
        await assertFails(shared(A)(as(B)).set(good()));
    });
    test('모양 밖은 거부: 6칸 · 모르는 필드 · 시각 위조', async () => {
        await assertFails(shared(A)(as(A)).set(Object.assign(good(), { teams: ['1', '2', '3', '4', '5', '6'] })));
        await assertFails(shared(A)(as(A)).set(Object.assign(good(), { email: 'a@b.c' })));
        await assertFails(shared(A)(as(A)).set(Object.assign(good(), { updated_at: new Date(0) })));
    });
    test('다른 이름의 문서는 못 만든다', async () => {
        await assertFails(as(A).collection('users').doc(A).collection('shared').doc('other').set(good()));
    });
    test('끊으면 더는 못 읽는다', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('friendships').doc([A, B].sort().join('_')).delete();
        });
        await assertFails(shared(A)(as(B)).get());
    });
});

describe('릴스 모더레이션 — 운영자 숨김 · 커버는 서버만 · 개수 상한', () => {
    const REEL = 'https://www.instagram.com/reel/ABC/';
    const COVER = 'https://firebasestorage.googleapis.com/v0/b/x/o/reel_covers%2FABC.jpg?alt=media&token=t';
    const reels = (n) => Array.from({ length: n }, (_, i) => 'https://www.instagram.com/reel/R' + i + '/');

    before(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await db.collection('clubs').doc('rm-hidden').set({
                name: '숨김팀', admins: ['rm-mgr'], registered_by: 'rm-mgr', is_verified: false,
                insta_reel: REEL, insta_reels: [REEL], insta_reel_covers: { ABC: COVER }, reels_hidden: true
            });
            await db.collection('clubs').doc('rm-open').set({
                name: '보통팀', admins: ['rm-mgr'], registered_by: 'rm-mgr', is_verified: false,
                insta_reel: REEL, insta_reels: [REEL], insta_reel_covers: { ABC: COVER }
            });
            await db.collection('pickup_games').doc('rm-pk-hidden').set({
                owner_uid: 'rm-pk-owner', title: '숨김 픽업', insta_reels: [REEL], reels_hidden: true
            });
            await db.collection('pickup_games').doc('rm-pk-open').set({
                owner_uid: 'rm-pk-owner', title: '보통 픽업', insta_reels: [REEL]
            });
        });
    });

    function as(uid) { return testEnv.authenticatedContext(uid).firestore(); }

    // ── 팀 관리자 ──
    test('관리자는 숨김을 스스로 풀 수 없다', async () => {
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-hidden').update({ reels_hidden: false }));
    });

    test('관리자는 숨김 필드를 빼고 문서를 통째로 덮어써서 풀 수도 없다', async () => {
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-hidden').set({
            name: '숨김팀', admins: ['rm-mgr'], registered_by: 'rm-mgr', is_verified: false,
            insta_reel: REEL, insta_reels: [REEL], insta_reel_covers: { ABC: COVER }
        }));
    });

    test('숨긴 팀도 릴스 외 내용은 계속 고칠 수 있다', async () => {
        await assertSucceeds(as('rm-mgr').collection('clubs').doc('rm-hidden').update({ price: '월 2만원' }));
    });

    test('숨긴 팀의 관리자가 릴스를 바꿔 넣어도 숨김은 유지된다(릴스 변경 자체는 허용)', async () => {
        await assertSucceeds(as('rm-mgr').collection('clubs').doc('rm-hidden').update({ insta_reels: [REEL] }));
    });

    test('관리자는 스스로 숨김을 켤 수도 없다 — 운영자 전용 필드', async () => {
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-open').update({ reels_hidden: true }));
    });

    test('관리자는 커버 맵을 바꿀 수 없다 — 아무 이미지나 커버로 띄우는 우회 차단', async () => {
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-open').update({
            insta_reel_covers: { ABC: 'https://evil.example/x.jpg' }
        }));
    });

    test('새 팀은 커버·숨김 해제 값을 들고 만들어질 수 없다', async () => {
        const base = { name: '새팀', registered_by: 'rm-new', is_verified: false };
        await assertFails(as('rm-new').collection('clubs').doc('rm-c1').set(Object.assign({}, base, {
            insta_reel_covers: { ABC: 'https://evil.example/x.jpg' }
        })));
        await assertFails(as('rm-new').collection('clubs').doc('rm-c2').set(Object.assign({}, base, { reels_hidden: 'no' })));
        await assertSucceeds(as('rm-new').collection('clubs').doc('rm-c3').set(Object.assign({}, base, {
            insta_reel: REEL, insta_reels: [REEL], reels_hidden: false
        })));
    });

    test('릴스는 10개까지 — 11개면 거부', async () => {
        await assertSucceeds(as('rm-mgr').collection('clubs').doc('rm-open').update({ insta_reels: reels(10) }));
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-open').update({ insta_reels: reels(11) }));
    });

    test('insta_reel 은 200자 이하 문자열', async () => {
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-open').update({ insta_reel: 'x'.repeat(201) }));
        await assertFails(as('rm-mgr').collection('clubs').doc('rm-open').update({ insta_reels: 'not-a-list' }));
    });

    test('운영자는 숨김을 켜고 끌 수 있다', async () => {
        await assertSucceeds(as('admin-uid').collection('clubs').doc('rm-open').update({ reels_hidden: true }));
        await assertSucceeds(as('admin-uid').collection('clubs').doc('rm-open').update({ reels_hidden: false }));
    });

    // ── 픽업 소유자 (익명 등록 가능 → 더 열려 있는 쪽) ──
    test('픽업 소유자는 숨김을 풀 수 없고, 내용은 고칠 수 있다', async () => {
        await assertFails(as('rm-pk-owner').collection('pickup_games').doc('rm-pk-hidden').update({ reels_hidden: false }));
        await assertSucceeds(as('rm-pk-owner').collection('pickup_games').doc('rm-pk-hidden').update({ notes: '이번 주 쉼' }));
    });

    test('픽업 소유자는 커버를 쓸 수 없고 릴스 상한도 같다', async () => {
        await assertFails(as('rm-pk-owner').collection('pickup_games').doc('rm-pk-open').update({
            insta_reel_covers: { ABC: 'https://evil.example/x.jpg' }
        }));
        await assertFails(as('rm-pk-owner').collection('pickup_games').doc('rm-pk-open').update({ insta_reels: reels(11) }));
    });

    test('새 픽업은 커버를 들고 만들어질 수 없다', async () => {
        await assertFails(as('rm-pk-new').collection('pickup_games').doc('rm-pk-c1').set({
            owner_uid: 'rm-pk-new', title: '새 픽업', insta_reel_covers: { ABC: COVER }
        }));
        await assertFails(as('rm-pk-new').collection('pickup_games').doc('rm-pk-c2').set({
            owner_uid: 'rm-pk-new', title: '새 픽업', reels_hidden: true
        }));
    });
});
