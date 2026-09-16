// tests/verify-approve.test.js
// 인증 승인이 **없는 팀에 유령 문서를 만들지 않는지** 검증.
//
// 챗봇 승인 경로는 set({ is_verified: true }, { merge: true }) 를 썼다. merge 는
// 문서가 없으면 만든다 — 삭제된 팀의 인증 요청을 승인하면 is_verified 하나만 든
// 문서가 새로 생겼다. 이름도 좌표도 없어 지도엔 안 뜨고 목록에만 남는다.
// 실제로 clubs 62건 중 2건이 그렇게 생긴 것이었고(wp4qeje5fac 는 테스트 인증
// 승인 1초 뒤 생성), 이번에 지웠다.
//
// 이메일 링크 경로는 update() 라 유령은 안 생겼지만, 요청을 approved 로 바꾼
// **뒤에** 팀을 써서 팀이 없으면 요청만 승인된 채 남았다. 순서도 같이 고쳤다.
//
// 실행: node --test tests/verify-approve.test.js

const { test, describe, before, after, beforeEach } = require('node:test');

const _quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };
before(() => {
    console.log = () => {}; console.warn = () => {};
    console.error = () => {}; console.info = () => {};
});

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const SKILL_KEY = 'test-skill-key-0123456789abcdef';
const ADMIN_ID = 'kakao-operator';
const REQ_ID = 'vr1';

let docs = {};
let created = [];   // 트랜잭션 밖에서 문서를 새로 만든 흔적

function makeRef(p) {
    return {
        path: p,
        get: async () => ({ exists: Object.hasOwn(docs, p), id: p.split('/').pop(), data: () => docs[p] }),
        set: async (d) => {
            if (!Object.hasOwn(docs, p)) created.push(p);
            docs[p] = Object.assign({}, docs[p], d);
        },
        update: async (d) => {
            if (!Object.hasOwn(docs, p)) throw new Error('NOT_FOUND: ' + p);
            docs[p] = Object.assign({}, docs[p], d);
        },
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
        add: async (d) => { created.push(name + '/auto'); return makeRef(name + '/auto'); },
        where: chain.where, limit: chain.limit, orderBy: chain.orderBy, get: chain.get
    };
}
const FieldValue = { serverTimestamp: () => '<ts>', delete: () => '<del>' };
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: makeCollection,
        batch: () => ({ delete() {}, commit: async () => {} }),
        runTransaction: async (fn) => fn({
            get: async (r) => r.get(),
            // 트랜잭션 update 도 없는 문서엔 못 쓴다 — 실제 Firestore 와 같게.
            update: (r, d) => {
                if (!Object.hasOwn(docs, r.path)) throw new Error('NOT_FOUND: ' + r.path);
                docs[r.path] = Object.assign({}, docs[r.path], d);
            },
            set: (r, d) => {
                if (!Object.hasOwn(docs, r.path)) created.push(r.path);
                docs[r.path] = Object.assign({}, docs[r.path], d);
            }
        })
    }), { FieldValue, Timestamp: { now: () => '<now>' } }),
    auth: () => ({ getUser: async () => ({ email: 'x@example.com', emailVerified: true }) })
};
const providerHttpStub = {
    KAPI_HOST: 'kapi.kakao.com', KAUTH_HOST: 'kauth.kakao.com',
    isOk: (s) => s >= 200 && s < 300, secretValue: () => 'secret',
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
Module._load = origLoad;
after(() => { Object.assign(console, _quiet); });

beforeEach(async () => {
    docs = {}; queryDocs = {}; created = [];
    docs['admins/__reset__'] = { ok: true };
    await fns.adminSetChatbotSkillKey({ auth: { uid: '__reset__' }, data: { mode: 'add', key: SKILL_KEY } });
    delete docs['admins/__reset__'];
    docs['admin_kakao_ids/' + ADMIN_ID] = { ok: true };
    docs['verification_requests/' + REQ_ID] = {
        club_id: 'ghost-club', club_name: '없어진팀',
        requested_by: 'uid-applicant', status: 'pending'
    };
});

function makeReq() {
    const headers = { 'X-Nurungji-Skill-Key': SKILL_KEY };
    return {
        get: (n) => headers[n] || headers[String(n).toLowerCase()],
        headers: headers, query: {},
        body: {
            userRequest: { utterance: '승인', user: { id: ADMIN_ID } },
            action: { clientExtra: { request_id: REQ_ID }, params: {} }
        }
    };
}
function makeRes() {
    const out = { code: 200, body: null };
    return { out, status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; } };
}
const text = (res) => JSON.stringify(res.out.body);

describe('인증 승인 — 없는 팀에 유령 문서를 만들지 않는다', () => {
    test('팀이 없으면 clubs 문서를 새로 만들지 않는다', async () => {
        const res = makeRes();
        await fns.chatbotApprove(makeReq(), res);
        assert.deepStrictEqual(
            created.filter((p) => p.startsWith('clubs/')), [],
            '없는 팀에 clubs 문서가 생겼다: ' + JSON.stringify(created)
        );
        assert.ok(!Object.hasOwn(docs, 'clubs/ghost-club'), 'clubs/ghost-club 이 생겼다');
    });

    test('팀이 없으면 요청을 승인이 아니라 거절로 닫는다', async () => {
        const res = makeRes();
        await fns.chatbotApprove(makeReq(), res);
        const r = docs['verification_requests/' + REQ_ID];
        assert.strictEqual(r.status, 'rejected');
        assert.strictEqual(r.reject_reason, 'club_missing');
    });

    test('팀이 없으면 운영자에게 이유를 말해준다', async () => {
        const res = makeRes();
        await fns.chatbotApprove(makeReq(), res);
        assert.ok(text(res).includes('없어졌'), text(res));
    });

    test('팀이 있으면 예전처럼 인증된다', async () => {
        docs['clubs/ghost-club'] = { name: '멀쩡한팀', registered_by: 'owner1' };
        const res = makeRes();
        await fns.chatbotApprove(makeReq(), res);
        assert.strictEqual(docs['clubs/ghost-club'].is_verified, true);
        assert.strictEqual(docs['verification_requests/' + REQ_ID].status, 'approved');
        assert.ok(text(res).includes('승인되었습니다'), text(res));
    });

    test('승인되면 신청자가 그 팀 관리자가 된다', async () => {
        docs['clubs/ghost-club'] = { name: '멀쩡한팀', registered_by: 'owner1' };
        const res = makeRes();
        await fns.chatbotApprove(makeReq(), res);
        assert.ok(
            (docs['clubs/ghost-club'].admins || []).includes('uid-applicant'),
            JSON.stringify(docs['clubs/ghost-club'])
        );
    });

    test('이미 처리된 요청은 팀을 건드리지 않는다', async () => {
        docs['verification_requests/' + REQ_ID].status = 'approved';
        docs['clubs/ghost-club'] = { name: '멀쩡한팀' };
        const res = makeRes();
        await fns.chatbotApprove(makeReq(), res);
        assert.strictEqual(docs['clubs/ghost-club'].is_verified, undefined);
    });
});

describe('챗봇 스킬 실행 옵션', () => {
    test('5초 안에 뜨도록 cpu·memory 를 올려 둔다', () => {
        // 콜드 스타트가 카카오 타임아웃을 넘긴 적이 있다(5.16초, 2026-09-16).
        // 이 값이 조용히 기본값으로 되돌아가면 그 실패가 그대로 돌아온다.
        const src = require('node:fs').readFileSync(
            path.join(process.cwd(), 'functions', 'index.js'), 'utf8');
        const m = src.match(/var CHATBOT_OPTS = \{[^}]*\};/);
        assert.ok(m, 'CHATBOT_OPTS 를 못 찾았다');
        assert.ok(/memory:\s*"512MiB"/.test(m[0]), m[0]);
        assert.ok(/cpu:\s*2/.test(m[0]), m[0]);
        assert.ok(/invoker:\s*"public"/.test(m[0]), '카카오가 부르려면 public 이어야 한다');
    });
});
