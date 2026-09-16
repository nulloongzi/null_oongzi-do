// tests/chatbot-access.test.js
// 챗봇 접근 경계 검증. 이 파일이 지키는 것은 두 층이다.
//
//   ① 스킬 키  — 이 호출이 카카오에서 온 게 맞나
//   ② 관리자   — 이 사람이 운영자인가
//
// ①이 없던 동안, 스킬 URL 은 invoker: "public" 이고 본문의 user.id 만 봤다.
// 즉 운영자의 카카오 user id 를 아는 사람이 주소만 알면 팀 삭제까지 할 수 있었다.
// 그 id 는 카카오가 정하는 값이라 새어도 바꿀 수가 없다.
//
// 그리고 공개 발화가 생기면서 ②가 '모두 거부'에서 '발화별로 다름'으로 바뀌었다.
// 관리 발화에 ②가 빠지거나 공개 발화에 ②가 잘못 붙는 것을 여기서 잡는다.
//
// 실행: node --test tests/chatbot-access.test.js

const { test, describe, before, after, beforeEach } = require('node:test');

// 실제 index.js 의 console 출력이 러너 stdout 과 섞이면 파일 전체가 유령 실패한다.
const _quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };
before(() => {
    console.log = () => {}; console.warn = () => {};
    console.error = () => {}; console.info = () => {};
});

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const SKILL_KEY = 'test-skill-key';

let docs = {};
let added = [];   // collection.add 로 들어온 것 — 제보가 실제로 저장되는지 본다
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
        add: async (data) => { added.push({ collection: name, data }); return makeRef(name + '/new'); },
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
    isOk: (s) => s >= 200 && s < 300,
    secretValue: () => 'secret',
    postForm: async () => ({ status: 200, body: '{}' }),
    getJson: async () => ({ status: 200, json: {} })
};
const fnStubs = {
    'firebase-functions/v2/https': { onRequest: (o, h) => h, onCall: (o, h) => h, HttpsError: class extends Error {} },
    'firebase-functions/v2/firestore': {
        onDocumentCreated: (o, h) => ({ _handler: h }), onDocumentWritten: (o, h) => ({ _handler: h }),
        onDocumentUpdated: (o, h) => ({ _handler: h }), onDocumentDeleted: (o, h) => ({ _handler: h })
    },
    'firebase-functions/params': {
        // CHATBOT_SKILL_KEY 만 실제 값을 주고 나머지는 아무 값이나. 이 파일의
        // 관심사는 '키가 맞고 틀림'이라 그 구분이 되는 게 중요하다.
        defineSecret: (n) => ({ value: () => (n === 'CHATBOT_SKILL_KEY' ? SKILL_KEY : 'secret'), name: n }),
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

beforeEach(() => { docs = {}; queryDocs = {}; added = []; });

// ── 요청/응답 스텁 ──
function makeReq(opts) {
    const o = opts || {};
    const headers = o.headers || {};
    return {
        get: (name) => headers[name] || headers[String(name).toLowerCase()] || undefined,
        query: o.query || {},
        body: {
            userRequest: {
                utterance: o.utterance || '',
                user: { id: o.userId || 'kakao-stranger' }
            },
            action: { clientExtra: o.clientExtra || {}, params: o.params || {} }
        }
    };
}
function makeRes() {
    const r = { statusCode: 200, payload: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (p) => { r.payload = p; return r; };
    return r;
}
const withKey = (o) => makeReq(Object.assign({ headers: { 'X-Nurungji-Skill-Key': SKILL_KEY } }, o || {}));
const text = (res) => JSON.stringify(res.payload);

// 관리자 발화 전부. 하나라도 빠지면 그 엔드포인트만 무방비가 된다.
const ADMIN_SKILLS = [
    'chatbotPending', 'chatbotApprove', 'chatbotRejectAsk', 'chatbotRejectConfirm',
    'chatbotTeamList', 'chatbotTeamDeleteAsk', 'chatbotTeamDelete',
    'chatbotReports', 'chatbotReportDone',
    'chatbotAdminRequests', 'chatbotAdminApprove', 'chatbotAdminReject',
    'chatbotClaims', 'chatbotClaimApprove', 'chatbotClaimReject'
];
const PUBLIC_SKILLS = ['chatbotHelp', 'chatbotPublicReport'];

describe('① 스킬 키 — 카카오 밖에서 온 호출', () => {
    for (const name of ADMIN_SKILLS.concat(PUBLIC_SKILLS)) {
        test(`${name}: 키가 없으면 401`, async () => {
            const res = makeRes();
            await fns[name](makeReq({}), res);
            assert.strictEqual(res.statusCode, 401, `${name} 이 키 없이 통과했다`);
        });
    }

    test('키가 틀리면 401', async () => {
        const res = makeRes();
        await fns.chatbotTeamList(makeReq({ headers: { 'X-Nurungji-Skill-Key': '틀린키' } }), res);
        assert.strictEqual(res.statusCode, 401);
    });

    test('길이가 같고 내용만 다른 키도 막는다', async () => {
        const res = makeRes();
        const wrong = 'x'.repeat(SKILL_KEY.length);
        await fns.chatbotTeamList(makeReq({ headers: { 'X-Nurungji-Skill-Key': wrong } }), res);
        assert.strictEqual(res.statusCode, 401);
    });

    test('쿼리 파라미터(?k=)로도 통과한다 — 헤더를 못 붙이는 콘솔 대비', async () => {
        const res = makeRes();
        await fns.chatbotHelp(makeReq({ query: { k: SKILL_KEY } }), res);
        assert.strictEqual(res.statusCode, 200);
    });

    test('401 응답은 챗봇 말풍선이 아니다 — 엔드포인트가 살아있음을 알리지 않는다', async () => {
        const res = makeRes();
        await fns.chatbotTeamDelete(makeReq({}), res);
        assert.ok(!text(res).includes('template'), '401 에 챗봇 템플릿이 실렸다');
    });
});

describe('② 관리자 — 관리 발화는 운영자만', () => {
    for (const name of ADMIN_SKILLS) {
        test(`${name}: 키는 맞아도 비관리자면 거부`, async () => {
            const res = makeRes();
            await fns[name](withKey({ userId: 'kakao-stranger' }), res);
            assert.strictEqual(res.statusCode, 200, '거부는 401 이 아니라 안내 말풍선이다');
            assert.ok(text(res).includes('권한이 없습니다'), `${name} 이 비관리자에게 내용을 돌려줬다`);
        });
    }

    test('운영자면 통과한다', async () => {
        docs['admin_kakao_ids/kakao-boss'] = { ok: true };
        const res = makeRes();
        await fns.chatbotReports(withKey({ userId: 'kakao-boss' }), res);
        assert.ok(!text(res).includes('권한이 없습니다'));
        assert.ok(text(res).includes('미처리 신고가 없습니다'));
    });
});

describe('공개 발화 — 누구나', () => {
    test('길잡이: 비관리자도 지도 링크를 받는다', async () => {
        const res = makeRes();
        await fns.chatbotHelp(withKey({ userId: 'kakao-stranger' }), res);
        assert.strictEqual(res.statusCode, 200);
        assert.ok(!text(res).includes('권한이 없습니다'), '공개 발화에 관리자 검사가 붙었다');
        assert.ok(text(res).includes('https://do.nulloongzi.com'));
    });

    test('길잡이가 없는 주소를 안내하지 않는다', async () => {
        const res = makeRes();
        await fns.chatbotHelp(withKey({}), res);
        // ?register=1 은 웹이 처리하지 않는다 — 지어낸 링크를 보내면 빈 지도가 뜬다
        assert.ok(!text(res).includes('register=1'));
    });

    test('제보: 한 줄이면 reports 에 저장된다', async () => {
        const res = makeRes();
        await fns.chatbotPublicReport(withKey({ utterance: '제보 GVT 운동 시간이 바뀌었어요' }), res);
        assert.strictEqual(added.length, 1);
        assert.strictEqual(added[0].collection, 'reports');
        assert.strictEqual(added[0].data.kind, 'chatbot');
        assert.strictEqual(added[0].data.status, 'open');
        assert.strictEqual(added[0].data.detail, 'GVT 운동 시간이 바뀌었어요');
    });

    test('제보: 답장을 약속하지 않는다', async () => {
        const res = makeRes();
        await fns.chatbotPublicReport(withKey({ utterance: '제보 주소가 틀려요' }), res);
        assert.ok(text(res).includes('답장드리진 못해요'),
            '답장 못 한다는 사실을 안 알리면 사람들이 기다린다');
    });

    test('제보: 내용이 없으면 저장하지 않고 예시를 보여준다', async () => {
        const res = makeRes();
        await fns.chatbotPublicReport(withKey({ utterance: '제보' }), res);
        assert.strictEqual(added.length, 0, '빈 제보가 신고 목록에 쌓이면 안 된다');
        assert.ok(text(res).includes('예)'));
    });

    test('제보: 비관리자가 보내도 접수된다', async () => {
        const res = makeRes();
        await fns.chatbotPublicReport(withKey({ userId: 'kakao-stranger', utterance: '제보 확인 부탁드려요' }), res);
        assert.ok(!text(res).includes('권한이 없습니다'));
        assert.strictEqual(added.length, 1);
    });
});

describe('신고 목록에서 카톡 제보가 구분된다', () => {
    test("kind 'chatbot' 이 '동호회' 로 보이지 않는다", async () => {
        docs['admin_kakao_ids/kakao-boss'] = { ok: true };
        queryDocs['reports'] = [{
            id: 'r1',
            data: { kind: 'chatbot', target_name: '카카오톡 채널 제보', reason: 'other', detail: '주소 바뀜', status: 'open' }
        }];
        const res = makeRes();
        await fns.chatbotReports(withKey({ userId: 'kakao-boss' }), res);
        const out = text(res);
        assert.ok(out.includes('카톡 제보'), '카톡 제보가 라벨로 구분되지 않는다');
    });
});
