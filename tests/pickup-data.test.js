// tests/pickup-data.test.js
// 픽업 스팟 create/update 페이로드 검증 — 특히 source('curated') 보존.
// 실행: node --test tests/pickup-data.test.js
//
// js/pickup-data.js 는 IIFE로 window.* 에 할당하는 classic script (pickup-filter.test.js와 동일 패턴).
// Firestore는 add/update 호출을 캡처하는 스텁으로 대체 — 페이로드 형태만 본다.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'js', 'pickup-data.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf-8');

let sandbox;
let added;   // firebaseDB.add 로 들어간 doc
let updated; // firebaseDB.update 로 들어간 fields

beforeEach(() => {
    added = null;
    updated = null;
    sandbox = { console };
    sandbox.window = {
        // 로그인 상태로 두어 ensureUid가 익명 인증(firebase 전역)을 안 타게 한다
        currentUser: { uid: 'test-uid' },
        firebaseServerTimestamp: () => 'SERVER_TS',
        firebaseDB: {
            collection: (name) => {
                assert.strictEqual(name, 'pickup_games');
                return {
                    add: (doc) => { added = doc; return Promise.resolve({ id: 'new-id' }); },
                    doc: () => ({ update: (fields) => { updated = fields; return Promise.resolve(); } }),
                };
            },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(scriptSource, sandbox);
});

describe('createPickupGame — source 보존', () => {
    test("source:'curated' 가 create 페이로드에 살아남는다 (시딩 고지·삭제요청 통로)", async () => {
        await sandbox.window.createPickupGame({ title: '시딩 크루', source: 'curated' });
        assert.strictEqual(added.source, 'curated');
    });

    test('source 미지정이면 키 자체가 없다 (일반 등록에 불필요한 필드 미저장)', async () => {
        await sandbox.window.createPickupGame({ title: '일반 크루' });
        assert.strictEqual('source' in added, false);
    });

    test("관리자가 해제한 source:'' 도 그대로 전달된다", async () => {
        await sandbox.window.createPickupGame({ title: '해제 크루', source: '' });
        assert.strictEqual(added.source, '');
    });

    test('owner_uid·기본값이 함께 채워진다', async () => {
        const doc = await sandbox.window.createPickupGame({ title: '크루' });
        assert.strictEqual(added.owner_uid, 'test-uid');
        assert.strictEqual(added.sport, '6s');
        assert.strictEqual(added.coordinates, null);
        assert.strictEqual(doc.id, 'new-id');
    });
});

describe('updatePickupGame — 기존 동작 유지', () => {
    test("update 경로도 source:'curated' 를 전달한다", async () => {
        await sandbox.window.updatePickupGame('pk-1', { source: 'curated' });
        assert.strictEqual(updated.source, 'curated');
        assert.strictEqual(updated.updated_at, 'SERVER_TS');
    });
});
