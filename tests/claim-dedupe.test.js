// tests/claim-dedupe.test.js
// 소유권 클레임이 (팀, 사람)당 하나만 생기는지 검증.
//
// 예전 claimMyClubs 는 "pending 인 요청이 있나"를 **조회**해서 중복을 막았다.
// 조회와 쓰기 사이가 비어 있어서, 같은 사람의 호출이 겹치면 둘 다 "없다"를 보고
// 각자 문서를 만든다. 실제로 로그인 한 번에 이 함수가 같은 초에 두 번 불린
// 기록이 있다(2026-09-16 05:44:02, Cloud Run 요청 로그). 그러면 운영자의
// '클레임관리' 목록에 같은 건이 두 장 뜬다.
//
// 그리고 거절도 pending 이 아니라서 통과했다 — 거절당한 사람이 로그인할 때마다
// 요청이 새로 생겼다는 뜻이다. 운영자가 내린 판단이 매번 되살아나면 그게 도배다.
//
// 이제 문서 id 를 club_id + uid 로 고정하고 트랜잭션 안에서 쓴다. 겹쳐 불려도
// 같은 문서를 건드리므로 Firestore 가 직렬화한다.
//
// 실행: node --test tests/claim-dedupe.test.js

const { test, describe, before, after, beforeEach } = require('node:test');

// 실제 index.js 의 console 출력이 러너 stdout(v8 직렬화)과 섞이면
// "Unable to deserialize cloned data" 로 파일 전체가 유령 실패한다.
const _quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };
before(() => {
    console.log = () => {}; console.warn = () => {};
    console.error = () => {}; console.info = () => {};
});

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

let docs = {};
let added = [];    // 자동 id 로 들어간 쓰기 — 클레임이 여기로 가면 id 고정이 깨진 것
function makeRef(p) {
    return {
        path: p,
        get: async () => ({ exists: Object.hasOwn(docs, p), id: p.split('/').pop(), data: () => docs[p] }),
        set: async (d) => { docs[p] = Object.assign({}, docs[p], d); },
        update: async (d) => { docs[p] = Object.assign({}, docs[p], d); },
        delete: async () => { delete docs[p]; }
    };
}
let queryDocs = {};
function resultFor(name) {
    const list = (queryDocs[name] || []).map((d) => ({ id: d.id, data: () => d.data }));
    const snap = { empty: list.length === 0, size: list.length, docs: list, forEach: (fn) => list.forEach(fn) };
    const chain = { get: async () => snap, where: () => chain, limit: () => chain, orderBy: () => chain };
    return chain;
}
function makeCollection(name) {
    const chain = resultFor(name);
    return {
        doc: (id) => makeRef(name + '/' + id),
        add: async (data) => { added.push({ collection: name, data }); return makeRef(name + '/auto'); },
        where: chain.where, limit: chain.limit, orderBy: chain.orderBy, get: chain.get
    };
}
const FieldValue = { serverTimestamp: () => '<ts>', delete: () => '<del>' };

// 트랜잭션은 순차 실행만 흉내낸다. 진짜 경합은 Firestore 가 막는 것이고,
// 여기서 지키려는 건 "문서 경로가 (팀,사람)으로 고정돼 있다"는 쪽이다.
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: makeCollection,
        batch: () => ({ delete() {}, commit: async () => {} }),
        runTransaction: async (fn) => fn({
            get: async (r) => r.get(),
            update: (r, d) => { docs[r.path] = Object.assign({}, docs[r.path], d); },
            set: (r, d) => { docs[r.path] = Object.assign({}, docs[r.path], d); }
        })
    }), { FieldValue, Timestamp: { now: () => '<now>' } }),
    auth: () => ({ getUser: async () => ({ email: 'owner@example.com', emailVerified: true }) })
};
const providerHttpStub = {
    KAPI_HOST: 'kapi.kakao.com', KAUTH_HOST: 'kauth.kakao.com',
    isOk: (s) => s >= 200 && s < 300,
    secretValue: () => 'secret',
    postForm: async () => ({ status: 200, body: '{}' }),
    getJson: async () => ({ status: 200, json: {} })
};
const fnStubs = {
    'firebase-functions/v2/https': { onRequest: (o, h) => h, onCall: (o, h) => (typeof o === 'function' ? o : h), HttpsError: class extends Error {} },
    'firebase-functions/v2/firestore': {
        onDocumentCreated: (o, h) => ({ _handler: h }), onDocumentWritten: (o, h) => ({ _handler: h }),
        onDocumentUpdated: (o, h) => ({ _handler: h }), onDocumentDeleted: (o, h) => ({ _handler: h })
    },
    'firebase-functions/params': {
        defineSecret: (n) => ({ value: () => 'secret', name: n }),
        defineString: (n, o) => ({ value: () => (o && o.default) || '', name: n })
    }
};
const origLoad = Module._load;
Module._load = function (req) {
    if (Object.hasOwn(fnStubs, req)) return fnStubs[req];
    if (req === 'firebase-admin') return adminStub;
    if (req === './lib/provider-http') return providerHttpStub;
    return origLoad.apply(this, arguments);
};
const fns = require(path.join(process.cwd(), 'functions', 'index.js'));
const pure = require(path.join(process.cwd(), 'functions', 'lib', 'pure.js'));
Module._load = origLoad;
after(() => { Object.assign(console, _quiet); });

const UID = 'uid-abc123';
const CLUB = 'club-a';
const REQ_PATH = 'club_claim_requests/' + CLUB + '__' + UID;

beforeEach(() => {
    docs = {};
    queryDocs = {};
    added = [];
    // 시트로 받아둔 담당자 메일 ↔ 팀 문서
    queryDocs['club_claims'] = [{ id: CLUB, data: { email: 'owner@example.com' } }];
    docs['clubs/' + CLUB] = { name: '가나배구' };   // 주인 없음 = 클레임 가능
});

function call() {
    return fns.claimMyClubs({ auth: { uid: UID }, data: {} });
}
function claimDocs() {
    return Object.keys(docs).filter((k) => k.startsWith('club_claim_requests/'));
}

describe('claimMyClubs — (팀, 사람)당 요청 하나', () => {
    test('매칭되면 club_id__uid 경로에 pending 으로 생긴다', async () => {
        const res = await call();
        assert.strictEqual(res.status, 'requested');
        assert.deepStrictEqual(claimDocs(), [REQ_PATH]);
        assert.strictEqual(docs[REQ_PATH].status, 'pending');
        assert.strictEqual(docs[REQ_PATH].club_id, CLUB);
        assert.strictEqual(docs[REQ_PATH].uid, UID);
    });

    test('자동 id(add)로는 쓰지 않는다 — 겹쳐 불려도 같은 문서여야 한다', async () => {
        await call();
        const autoClaims = added.filter((a) => a.collection === 'club_claim_requests');
        assert.deepStrictEqual(autoClaims, []);
    });

    test('메일은 마스킹해서 저장한다 — 운영자 목록에 원문이 남지 않는다', async () => {
        await call();
        assert.strictEqual(docs[REQ_PATH].email_masked, pure.maskEmail('owner@example.com'));
        assert.ok(!JSON.stringify(docs[REQ_PATH]).includes('owner@example.com'));
    });

    test('두 번 불러도 문서는 하나 — 두 번째는 already_requested', async () => {
        await call();
        const second = await call();
        assert.deepStrictEqual(claimDocs(), [REQ_PATH]);
        assert.strictEqual(second.status, 'no_actionable_match');
        assert.deepStrictEqual(second.skipped, [{ clubId: CLUB, reason: 'already_requested' }]);
    });

    test('거절된 건은 되살아나지 않는다', async () => {
        docs[REQ_PATH] = { club_id: CLUB, uid: UID, status: 'rejected' };
        const res = await call();
        assert.strictEqual(docs[REQ_PATH].status, 'rejected');
        assert.deepStrictEqual(res.skipped, [{ clubId: CLUB, reason: 'already_rejected' }]);
        assert.deepStrictEqual(res.matches, []);
    });

    test('승인된 건도 다시 만들지 않는다', async () => {
        docs[REQ_PATH] = { club_id: CLUB, uid: UID, status: 'approved' };
        const res = await call();
        assert.deepStrictEqual(res.skipped, [{ clubId: CLUB, reason: 'already_yours' }]);
    });

    test('이미 주인이 있는 팀은 요청 자체를 안 만든다', async () => {
        docs['clubs/' + CLUB] = { name: '가나배구', registered_by: 'someone-else' };
        const res = await call();
        assert.deepStrictEqual(claimDocs(), []);
        assert.deepStrictEqual(res.skipped, [{ clubId: CLUB, reason: 'already_owned' }]);
    });

    test('시트에 없는 메일이면 아무 일도 없다', async () => {
        queryDocs['club_claims'] = [];
        const res = await call();
        assert.strictEqual(res.status, 'no_match');
        assert.deepStrictEqual(claimDocs(), []);
    });
});

describe('claimRequestId', () => {
    test('팀 id 와 uid 를 __ 로 잇는다', () => {
        assert.strictEqual(pure.claimRequestId('abc', 'uid1'), 'abc__uid1');
    });
    test('팀 id 안의 밑줄과 섞이지 않는다', () => {
        assert.strictEqual(pure.claimRequestId('test_club_001', 'uid1'), 'test_club_001__uid1');
    });
    test('같은 입력이면 항상 같은 값 — 이게 중복 방지의 근거다', () => {
        assert.strictEqual(pure.claimRequestId('abc', 'uid1'), pure.claimRequestId('abc', 'uid1'));
    });
    test('둘 중 하나라도 비면 빈 문자열 — 호출부가 걸러낸다', () => {
        assert.strictEqual(pure.claimRequestId('', 'uid1'), '');
        assert.strictEqual(pure.claimRequestId('abc', ''), '');
        assert.strictEqual(pure.claimRequestId(null, undefined), '');
    });
    test('"/" 가 들어오면 거부한다 — 문서 경로가 갈라진다', () => {
        assert.strictEqual(pure.claimRequestId('a/b', 'uid1'), '');
        assert.strictEqual(pure.claimRequestId('abc', 'u/1'), '');
    });
});

describe('claimReuseReason', () => {
    test('문서가 없으면 만들어도 된다', () => {
        assert.strictEqual(pure.claimReuseReason(null), null);
        assert.strictEqual(pure.claimReuseReason(undefined), null);
    });
    test('pending / rejected / approved 는 각각의 이유로 막는다', () => {
        assert.strictEqual(pure.claimReuseReason({ status: 'pending' }), 'already_requested');
        assert.strictEqual(pure.claimReuseReason({ status: 'rejected' }), 'already_rejected');
        assert.strictEqual(pure.claimReuseReason({ status: 'approved' }), 'already_yours');
    });
    test('모르는 상태면 막지 않는다 — 새 상태가 생겨도 클레임이 멈추지는 않게', () => {
        assert.strictEqual(pure.claimReuseReason({ status: 'weird' }), null);
        assert.strictEqual(pure.claimReuseReason({}), null);
    });
});
