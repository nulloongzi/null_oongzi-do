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
});
