// tests/storage-rules.test.js
// Phase 3의 Storage rules 자동 검증.
// 실행: firebase emulators:exec --only firestore,storage "node --test tests/storage-rules.test.js"
//
// 시나리오:
// - ST-1: SVG 업로드 거부
// - ST-2: 5MB 초과 거부
// - ST-3: 다른 uid 경로 쓰기 거부
// - ST-4: 정상 jpeg 통과
// - 추가: 평면 경로(uid 없는) 쓰기 거부
// - 추가: club_photos도 동일 룰

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'nulloongzido-storage-test';
let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        storage: {
            rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'),
            host: '127.0.0.1',
            port: 9199
        }
    });
});

after(async () => {
    if (testEnv) await testEnv.cleanup();
});

// 헬퍼: Blob → uint8array (Node)
function makeBlob(sizeBytes, contentType) {
    return new Blob([new Uint8Array(sizeBytes)], { type: contentType });
}

describe('Phase 3: verification_photos write 룰', () => {
    test('ST-4: 정상 image/jpeg 업로드(본인 uid, 1KB) 통과', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        const ref = storage.ref('verification_photos/user-A/club_123_ts_photo.jpg');
        await assertSucceeds(ref.put(makeBlob(1024, 'image/jpeg')));
    });

    test('image/png 통과', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertSucceeds(
            storage.ref('verification_photos/user-A/p.png').put(makeBlob(2048, 'image/png'))
        );
    });

    test('image/webp 통과', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertSucceeds(
            storage.ref('verification_photos/user-A/p.webp').put(makeBlob(2048, 'image/webp'))
        );
    });

    test('image/gif 통과', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertSucceeds(
            storage.ref('verification_photos/user-A/p.gif').put(makeBlob(2048, 'image/gif'))
        );
    });

    test('ST-1: image/svg+xml 거부 (XSS 호스팅 방지)', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        const ref = storage.ref('verification_photos/user-A/evil.svg');
        await assertFails(ref.put(makeBlob(1024, 'image/svg+xml')));
    });

    test('text/html 거부', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('verification_photos/user-A/page.html').put(makeBlob(1024, 'text/html'))
        );
    });

    test('application/pdf 거부 (이미지 화이트리스트만)', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('verification_photos/user-A/doc.pdf').put(makeBlob(1024, 'application/pdf'))
        );
    });

    test('ST-2: 5MB 초과 jpeg 거부', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        const oversized = 5 * 1024 * 1024 + 1;
        await assertFails(
            storage.ref('verification_photos/user-A/big.jpg').put(makeBlob(oversized, 'image/jpeg'))
        );
    });

    test('5MB 경계(딱 5MB) 거부 (< 5MB only)', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('verification_photos/user-A/exact5mb.jpg')
                .put(makeBlob(5 * 1024 * 1024, 'image/jpeg'))
        );
    });

    test('ST-3: 다른 uid 디렉터리 쓰기 거부', async () => {
        const ctx = testEnv.authenticatedContext('user-B');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('verification_photos/user-A/hijack.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('비로그인 쓰기 거부', async () => {
        const ctx = testEnv.unauthenticatedContext();
        const storage = ctx.storage();
        await assertFails(
            storage.ref('verification_photos/anon/p.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('uid 없는 평면 경로 쓰기 거부 (구버전 호환 read만 유지)', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('verification_photos/photo_only.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('서브 디렉터리 traversal 시도 거부 (single segment 룰)', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        // verification_photos/user-A/sub/deep.jpg — {fileName}이 single segment이므로 매치 안 됨
        await assertFails(
            storage.ref('verification_photos/user-A/sub/deep.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('public read는 모든 경로에서 통과 (chatbot 썸네일 호환)', async () => {
        // 사전 업로드 (rules disabled context로)
        await testEnv.withSecurityRulesDisabled(async (sctx) => {
            await sctx.storage().ref('verification_photos/legacy_flat.jpg')
                .put(makeBlob(1024, 'image/jpeg'));
        });
        const ctx = testEnv.unauthenticatedContext();
        const storage = ctx.storage();
        await assertSucceeds(
            storage.ref('verification_photos/legacy_flat.jpg').getDownloadURL()
        );
    });
});

describe('Phase 3: club_photos 룰 (대칭 적용)', () => {
    test('본인 uid jpeg 통과', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertSucceeds(
            storage.ref('club_photos/user-A/team.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('타uid 쓰기 거부', async () => {
        const ctx = testEnv.authenticatedContext('user-B');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('club_photos/user-A/hijack.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('SVG 거부', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('club_photos/user-A/evil.svg').put(makeBlob(1024, 'image/svg+xml'))
        );
    });
});

describe('정의되지 않은 경로는 기본 거부', () => {
    test('임의 경로 쓰기 거부', async () => {
        const ctx = testEnv.authenticatedContext('user-A');
        const storage = ctx.storage();
        await assertFails(
            storage.ref('random_bucket/file.jpg').put(makeBlob(1024, 'image/jpeg'))
        );
    });

    test('임의 경로 read 거부', async () => {
        const ctx = testEnv.unauthenticatedContext();
        const storage = ctx.storage();
        await assertFails(
            storage.ref('random_bucket/file.jpg').getDownloadURL()
        );
    });
});
