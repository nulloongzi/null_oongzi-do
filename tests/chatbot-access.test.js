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

const SKILL_KEY = 'test-skill-key-0123456789abcdef';   // 24자 이상(콜러블 검증 통과용)

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
    docs = {};
    queryDocs = {};
    added = [];
    // 스킬 키는 system/chatbot_skill_key 에 있다(Secret Manager 가 아니라).
    //
    // 키 조회는 60초 캐시라 앞 테스트의 값이 남는다. 콜러블이 그 캐시를 비우므로
    // 매 테스트를 실제 경로로 초기화한다 — docs 만 갈아끼우면 캐시가 어긋나서
    // '테스트는 통과하는데 실제로는 다른 값' 이 된다.
    docs['admins/__reset__'] = { ok: true };
    await fns.adminSetChatbotSkillKey({
        auth: { uid: '__reset__' },
        data: { mode: 'add', key: SKILL_KEY }
    });
    delete docs['admins/__reset__'];
});

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

describe('스킬 키 운용 — 회전과 미설정', () => {
    test('키를 여러 개 두면 둘 다 통한다 — 회전 중 끊기지 않게', async () => {
        docs['admins/boss'] = { ok: true };
        const oldKey = 'old-key-'.padEnd(30, 'x');
        // 실제 회전 경로를 그대로 탄다: 콜러블로 키를 더하면 캐시도 그때 비워진다.
        await fns.adminSetChatbotSkillKey({ auth: { uid: 'boss' }, data: { mode: 'add', key: oldKey } });

        const a = makeRes();
        await fns.chatbotHelp(makeReq({ headers: { 'X-Nurungji-Skill-Key': oldKey } }), a);
        assert.strictEqual(a.statusCode, 200, '더한 키가 안 먹는다');
        const b = makeRes();
        await fns.chatbotHelp(withKey({}), b);
        assert.strictEqual(b.statusCode, 200, '기존 키가 끊겼다 — 회전 중 챗봇이 죽는다');
    });

    test('adminSetChatbotSkillKey: 관리자만 쓸 수 있다', async () => {
        await assert.rejects(
            () => fns.adminSetChatbotSkillKey({ auth: { uid: 'nobody' }, data: { key: 'x'.repeat(30) } })
        );
    });

    test('adminSetChatbotSkillKey: add 는 더하고 remove 는 뺀다', async () => {
        docs['admins/boss'] = { ok: true };
        docs['system/chatbot_skill_key'] = { keys: [] };
        const ctx = (data) => ({ auth: { uid: 'boss' }, data });
        const k1 = 'k1'.padEnd(30, 'a');
        const k2 = 'k2'.padEnd(30, 'b');

        let r = await fns.adminSetChatbotSkillKey(ctx({ mode: 'add', key: k1 }));
        assert.strictEqual(r.count, 1);
        r = await fns.adminSetChatbotSkillKey(ctx({ mode: 'add', key: k2 }));
        assert.strictEqual(r.count, 2, '회전하려면 두 개가 동시에 살아 있어야 한다');
        r = await fns.adminSetChatbotSkillKey(ctx({ mode: 'remove', key: k1 }));
        assert.strictEqual(r.count, 1);
        assert.deepStrictEqual(docs['system/chatbot_skill_key'].keys, [k2]);
    });

    test('adminSetChatbotSkillKey: 짧은 키는 거부', async () => {
        docs['admins/boss'] = { ok: true };
        await assert.rejects(
            () => fns.adminSetChatbotSkillKey({ auth: { uid: 'boss' }, data: { mode: 'add', key: 'short' } })
        );
    });

    test('adminSetChatbotSkillKey: list 는 값을 돌려주지 않는다', async () => {
        docs['admins/boss'] = { ok: true };
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY] };
        const r = await fns.adminSetChatbotSkillKey({ auth: { uid: 'boss' }, data: { mode: 'list' } });
        assert.strictEqual(r.configured, true);
        assert.strictEqual(r.count, 1);
        assert.ok(!JSON.stringify(r).includes(SKILL_KEY), '조회 응답에 키 값이 실렸다');
    });
});

describe('audit 모드 — 17개 중 하나를 빠뜨렸을 때', () => {
    // 콘솔 스킬이 17개라 헤더를 하나 빠뜨리기 쉽다. 게다가 대기 건이 0인 스킬은
    // 눌러볼 수가 없어서, 켜자마자 막으면 '쓰려는 순간에야' 죽은 걸 알게 된다.
    test('audit 이면 키가 없어도 통과시킨다', async () => {
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY], mode: 'audit' };
        docs['admins/kakao-boss'] = { ok: true };
        const res = makeRes();
        await fns.chatbotHelp(makeReq({}), res);   // 헤더 없음
        assert.strictEqual(res.statusCode, 200, 'audit 인데 막았다');
    });

    test('audit 이어도 관리자 검사는 그대로 산다', async () => {
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY], mode: 'audit' };
        const res = makeRes();
        await fns.chatbotTeamDelete(makeReq({ userId: 'kakao-stranger' }), res);
        assert.ok(text(res).includes('권한이 없습니다'),
            'audit 은 스킬 키만 느슨하게 하는 것이지 권한을 여는 게 아니다');
    });

    test('enforce 로 바꾸면 막는다', async () => {
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY], mode: 'enforce' };
        const res = makeRes();
        await fns.chatbotHelp(makeReq({}), res);
        assert.strictEqual(res.statusCode, 401);
    });

    test('mode 가 없으면 enforce 가 기본 — 열어두는 쪽이 기본이면 안 된다', async () => {
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY] };
        const res = makeRes();
        await fns.chatbotHelp(makeReq({}), res);
        assert.strictEqual(res.statusCode, 401);
    });

    test('콜러블로 audit ↔ enforce 를 오간다', async () => {
        docs['admins/boss'] = { ok: true };
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY] };
        const call = (data) => fns.adminSetChatbotSkillKey({ auth: { uid: 'boss' }, data });

        let r = await call({ mode: 'audit' });
        assert.strictEqual(r.enforce, false);
        let a = makeRes();
        await fns.chatbotHelp(makeReq({}), a);
        assert.strictEqual(a.statusCode, 200, 'audit 으로 바꿨는데 여전히 막는다');

        r = await call({ mode: 'enforce' });
        assert.strictEqual(r.enforce, true);
        let b = makeRes();
        await fns.chatbotHelp(makeReq({}), b);
        assert.strictEqual(b.statusCode, 401, 'enforce 로 바꿨는데 안 막는다');
    });

    test('list 가 지금 막고 있는지 알려준다', async () => {
        docs['admins/boss'] = { ok: true };
        docs['system/chatbot_skill_key'] = { keys: [SKILL_KEY], mode: 'audit' };
        const r = await fns.adminSetChatbotSkillKey({ auth: { uid: 'boss' }, data: { mode: 'list' } });
        assert.strictEqual(r.configured, true);
        assert.strictEqual(r.enforce, false);
    });
});
