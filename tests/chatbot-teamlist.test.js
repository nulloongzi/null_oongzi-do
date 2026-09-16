// tests/chatbot-teamlist.test.js
// '팀관리'가 5초 안에 끝나는 모양을 유지하는지 검증.
//
// 카카오 스킬 타임아웃은 5초다. 이 스킬은 운영자가 며칠에 한 번 쓰는 탓에 **늘
// 콜드**이고, Cloud Run 요청 로그에서 3.0~4.3초를 찍어 왔다. 같은 챗봇의 다른
// 스킬은 5.10초·5.39초로 실제로 넘긴 적이 있다(1001 타임아웃).
//
// 콜드 인스턴스에서 Firestore 왕복은 한 번에 수백 ms 다. 예전 코드는 그걸
// 순서대로 세 번 기다렸다 — 스킬 키 → 관리자 확인 → clubs 전량. 뒤의 둘은
// 서로를 기다릴 이유가 없으므로 같이 띄운다.
//
// 문서 개수는 원인이 아니었다. 실측하면 62건과 10건의 차이는 30ms 남짓이다.
// 그래도 정렬을 Firestore 에 맡기는 쪽이 맞다 — 보이는 목록은 그대로이면서
// (created_at 없는 문서는 예전에도 0 으로 밀려 상위 10개에 못 들었다)
// 받아서 파싱하는 양이 6분의 1이 된다.
//
// 실행: node --test tests/chatbot-teamlist.test.js

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

let docs = {};
let calls = [];          // clubs 쿼리에 무엇이 붙었는지
let adminGate = null;    // 관리자 조회를 우리가 원할 때 풀어준다

function makeRef(p) {
    return {
        path: p,
        get: async () => {
            if (p.startsWith('admin_kakao_ids/')) {
                calls.push({ op: 'admin.get', at: calls.length });
                if (adminGate) await adminGate.promise;
            }
            return { exists: Object.hasOwn(docs, p), id: p.split('/').pop(), data: () => docs[p] };
        },
        set: async (d) => { docs[p] = Object.assign({}, docs[p], d); },
        update: async (d) => { docs[p] = Object.assign({}, docs[p], d); },
        delete: async () => { delete docs[p]; }
    };
}

let clubRows = [];
function clubsChain(state) {
    const st = state || {};
    const chain = {
        orderBy: (f, dir) => { st.orderBy = { field: f, dir: dir }; return clubsChain(st); },
        limit: (n) => { st.limit = n; return clubsChain(st); },
        where: () => clubsChain(st),
        get: async () => {
            calls.push({ op: 'clubs.get', orderBy: st.orderBy, limit: st.limit, at: calls.length });
            let rows = clubRows.slice();
            if (st.limit != null) rows = rows.slice(0, st.limit);
            const list = rows.map((d) => ({ id: d.id, data: () => Object.assign({}, d.data) }));
            return { empty: list.length === 0, size: list.length, docs: list, forEach: (fn) => list.forEach(fn) };
        }
    };
    return chain;
}

function makeCollection(name) {
    if (name === 'clubs') {
        const c = clubsChain({});
        return { doc: (id) => makeRef(name + '/' + id), orderBy: c.orderBy, limit: c.limit, where: c.where, get: c.get,
            add: async () => makeRef(name + '/auto') };
    }
    const empty = { empty: true, size: 0, docs: [], forEach: () => {} };
    const chain = { get: async () => empty, where: () => chain, limit: () => chain, orderBy: () => chain };
    return {
        doc: (id) => makeRef(name + '/' + id),
        add: async () => makeRef(name + '/auto'),
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
            update: (r, d) => { docs[r.path] = Object.assign({}, docs[r.path], d); },
            set: (r, d) => { docs[r.path] = Object.assign({}, docs[r.path], d); }
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
    docs = {}; calls = []; adminGate = null;
    docs['admins/__reset__'] = { ok: true };
    await fns.adminSetChatbotSkillKey({ auth: { uid: '__reset__' }, data: { mode: 'add', key: SKILL_KEY } });
    delete docs['admins/__reset__'];
    docs['admin_kakao_ids/' + ADMIN_ID] = { ok: true };
    clubRows = [];
    for (let i = 0; i < 25; i++) {
        clubRows.push({ id: 'club' + i, data: { name: '팀' + i, address: '서울', is_verified: i % 2 === 0, registered_by: 'u' + i } });
    }
});

function makeReq(opts) {
    const o = opts || {};
    const headers = o.headers === undefined ? { 'X-Nurungji-Skill-Key': SKILL_KEY } : o.headers;
    return {
        get: (n) => headers[n] || headers[String(n).toLowerCase()],
        headers: headers,
        query: {},
        body: { userRequest: { utterance: '팀관리', user: { id: o.userId || ADMIN_ID } }, action: { clientExtra: {}, params: {} } }
    };
}
function makeRes() {
    const out = { code: 200, body: null };
    return { out, status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; } };
}

describe('팀관리 — Firestore 왕복을 줄인다', () => {
    test('컬렉션을 통째로 읽지 않는다 — 정렬과 개수 제한을 Firestore 에 맡긴다', async () => {
        const res = makeRes();
        await fns.chatbotTeamList(makeReq(), res);
        const q = calls.find((c) => c.op === 'clubs.get');
        assert.ok(q, 'clubs 조회가 없다');
        assert.deepStrictEqual(q.orderBy, { field: 'metadata.created_at', dir: 'desc' });
        assert.strictEqual(q.limit, 10);
    });

    test('권한 확인을 기다리지 않고 목록 조회를 같이 띄운다', async () => {
        // 관리자 조회를 붙잡아 둔다. 순서대로 기다리는 코드라면 clubs 조회가
        // 아직 시작조차 못 한 상태여야 한다.
        let release;
        adminGate = { promise: new Promise((r) => { release = r; }) };

        const res = makeRes();
        const done = fns.chatbotTeamList(makeReq(), res);
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));

        assert.ok(calls.some((c) => c.op === 'admin.get'), '관리자 조회가 시작되지 않았다');
        assert.ok(
            calls.some((c) => c.op === 'clubs.get'),
            '관리자 조회가 끝나기를 기다리느라 목록 조회가 시작되지 않았다 — 왕복이 직렬이다'
        );

        release();
        await done;
        assert.strictEqual(res.out.code, 200);
    });

    test('카드는 그대로 만들어진다 — 10장, 삭제 버튼 포함', async () => {
        const res = makeRes();
        await fns.chatbotTeamList(makeReq(), res);
        const items = res.out.body.template.outputs[0].carousel.items;
        assert.strictEqual(items.length, 10);
        assert.strictEqual(items[0].title, '팀0');
        assert.strictEqual(items[0].buttons[0].label, '🗑 삭제');
        assert.strictEqual(items[0].buttons[0].extra.club_id, 'club0');
    });

    test('Firestore 가 준 순서를 그대로 쓴다 — 다시 정렬하지 않는다', async () => {
        clubRows = [
            { id: 'newest', data: { name: '최신', address: '서울' } },
            { id: 'older', data: { name: '예전', address: '부산' } }
        ];
        const res = makeRes();
        await fns.chatbotTeamList(makeReq(), res);
        const items = res.out.body.template.outputs[0].carousel.items;
        assert.deepStrictEqual(items.map((i) => i.title), ['최신', '예전']);
    });

    test('비관리자에게는 목록이 나가지 않는다', async () => {
        const res = makeRes();
        await fns.chatbotTeamList(makeReq({ userId: 'kakao-stranger' }), res);
        const text = JSON.stringify(res.out.body);
        assert.ok(text.includes('권한이 없습니다'), text);
        assert.ok(!text.includes('팀0'), '권한이 없는데 팀 이름이 응답에 실렸다');
        assert.ok(!text.includes('carousel'), '권한이 없는데 목록 카드가 나갔다');
    });

    test('스킬 키가 없으면 401 — 챗봇 말풍선도 주지 않는다', async () => {
        // mode 필드가 없으면 enforce 가 기본이다(여는 쪽이 기본이면 안 된다).
        const res = makeRes();
        await fns.chatbotTeamList(makeReq({ headers: {} }), res);
        assert.strictEqual(res.out.code, 401);
        assert.ok(!JSON.stringify(res.out.body).includes('template'));
    });

    test('팀이 하나도 없으면 안내만 준다', async () => {
        clubRows = [];
        const res = makeRes();
        await fns.chatbotTeamList(makeReq(), res);
        assert.strictEqual(res.out.body.template.outputs[0].simpleText.text, '등록된 팀이 없습니다.');
    });
});
