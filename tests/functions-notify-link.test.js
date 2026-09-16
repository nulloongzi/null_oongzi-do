// tests/functions-notify-link.test.js
// 카카오 알림의 '자세히 보기'가 **대상으로** 가는지 검증.
//
// 순수 로직(deepLinkUrl)은 functions-pure.test.js 가 본다. 여기서 보는 건 배선이다 —
// 신고 문서의 kind/target_id, 인증 요청의 club_id 가 실제로 링크까지 흘러가는가.
// 예전엔 네 곳 모두 사이트 첫 화면으로만 가서, 알림에 팀 이름이 적혀 있는데도
// 누르면 "어느 팀이었지"부터 다시 찾아야 했다. 헬퍼만 고치고 배선을 빠뜨리면
// 증상이 그대로 남으므로, 진짜 functions/index.js 를 불러 확인한다.
//
// 실행: node --test tests/functions-notify-link.test.js

const { test, describe, before, after, beforeEach } = require('node:test');

// functions-provider-http.test.js 와 같은 이유로 입을 막는다: 실제 index.js 의
// console 출력이 node:test 러너의 stdout(v8 직렬화)과 섞이면
// "Unable to deserialize cloned data" 로 파일 전체가 유령 실패한다.
const _quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };
before(() => {
    console.log = () => {}; console.warn = () => {};
    console.error = () => {}; console.info = () => {};
});

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

// ── 가짜 Firestore: 문서 경로 → 데이터. 쓰기는 무시(여기선 링크만 본다) ──
let docs = {};
function makeRef(p) {
    return {
        path: p,
        get: async () => ({ exists: Object.hasOwn(docs, p), id: p.split('/').pop(), data: () => docs[p] }),
        set: async (data) => { docs[p] = Object.assign({}, docs[p], data); },
        update: async (data) => { docs[p] = Object.assign({}, docs[p], data); },
        delete: async () => { delete docs[p]; }
    };
}
// 컬렉션별로 쿼리 결과를 심을 수 있게 한다(기본은 빈 결과).
let queryDocs = {};
function resultFor(name) {
    const docs = (queryDocs[name] || []).map((d) => ({ id: d.id, data: () => d.data }));
    const snap = {
        empty: docs.length === 0, size: docs.length, docs,
        forEach(fn) { docs.forEach(fn); }
    };
    const chain = {
        get: async () => snap,
        where: () => chain, limit: () => chain, orderBy: () => chain
    };
    return chain;
}
function makeCollection(name) {
    const chain = resultFor(name);
    return {
        doc: (id) => makeRef(name + '/' + id),
        add: async () => makeRef(name + '/new'),
        where: chain.where, limit: chain.limit, orderBy: chain.orderBy, get: chain.get
    };
}

const FieldValue = { serverTimestamp: () => '<ts>', delete: () => '<del>' };

// 트랜잭션은 grantClubAdmin 이 정원을 다시 세는 자리다 — 스텁이 이걸 흉내내지
// 못하면 이 기능의 급소가 테스트 밖으로 빠진다. 읽기는 docs 를, 쓰기는 docs 에
// 그대로 반영해 승인 뒤 admins 가 어떻게 됐는지 볼 수 있게 한다.
function makeTx() {
    return {
        get: async (ref) => ref.get(),
        update: (ref, data) => { docs[ref.path] = Object.assign({}, docs[ref.path], data); },
        set: (ref, data) => { docs[ref.path] = Object.assign({}, docs[ref.path], data); }
    };
}
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: makeCollection,
        batch: () => ({ delete() {}, commit: async () => {} }),
        runTransaction: async (fn) => fn(makeTx())
    }), { FieldValue, Timestamp: { now: () => '<now>' } }),
    auth: () => ({ getUser: async () => ({ email: 'x@example.com', emailVerified: true }) })
};

// ── 가짜 카카오: 나간 요청을 모아둔다 ──
let sent = [];
const providerHttpStub = {
    KAPI_HOST: 'kapi.kakao.com', KAUTH_HOST: 'kauth.kakao.com',
    isOk: (s) => s >= 200 && s < 300,
    secretValue: () => 'secret',
    postForm: async (host, p, body) => { sent.push({ host, path: p, body }); return { status: 200, body: '{}' }; },
    getJson: async () => ({ status: 200, json: {} })
};

const fnStubs = {
    'firebase-functions/v2/https': { onRequest: (o, h) => h, onCall: (o, h) => h, HttpsError: class extends Error {} },
    'firebase-functions/v2/firestore': {
        onDocumentCreated: (o, h) => ({ _handler: h }), onDocumentWritten: (o, h) => ({ _handler: h }),
        onDocumentUpdated: (o, h) => ({ _handler: h }), onDocumentDeleted: (o, h) => ({ _handler: h })
    },
    'firebase-functions/params': {
        // CHATBOT_SKILL_KEY 만 빈 값을 준다. 이 파일이 보는 건 알림 배선이지
        // 접근 경계가 아니고, 빈 값이면 스킬 키 검증이 '미설정' 경로로 통과한다.
        // 설정된 경우의 동작은 tests/chatbot-access.test.js 가 본다.
        defineSecret: (n) => ({ value: () => (n === 'CHATBOT_SKILL_KEY' ? '' : 'secret'), name: n }),
        defineString: (n, o) => ({ value: () => (o && o.default) || '', name: n })
    }
};

// 블록 ID 가 있어야 카드 모드로 응답한다. index.js 가 로드 시점에 읽으므로
// require 전에 심는다.
process.env.ADMIN_APPROVE_BLOCK_ID = 'blk-approve';
process.env.ADMIN_REJECT_BLOCK_ID = 'blk-reject';

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

// 토큰 갱신 경로를 타지 않도록 유효한 access token 을 캐시에 심어둔다.
beforeEach(() => {
    sent = [];
    queryDocs = {};
    docs = { 'system/kakao_token': { access_token: 'tok', expires_at: Date.now() + 3600e3 } };
});

// 나간 요청 본문(template_object=<urlencoded json>)에서 link 를 꺼낸다.
function sentLink(i) {
    const body = sent[i].body;
    const json = decodeURIComponent(body.replace(/^template_object=/, ''));
    return JSON.parse(json).link;
}

function snapshotOf(p, data) {
    return { data: { ref: makeRef(p), data: () => data } };
}

describe('신고 알림 링크 (onReportCreated)', () => {
    test('동호회 신고는 그 팀으로 간다', async () => {
        await fns.onReportCreated._handler(snapshotOf('reports/r1', {
            status: 'open', kind: 'club', target_id: 'club-abc', target_name: '테스트팀', reason: 'wrong_info'
        }));
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sentLink(0).web_url, 'https://do.nulloongzi.com/?club=club-abc');
    });

    // reports.kind 는 'pickup', 착지 쿼리는 'spot' — 배선이 이 변환을 거치는지 본다.
    test('픽업 신고는 ?spot= 으로 간다', async () => {
        await fns.onReportCreated._handler(snapshotOf('reports/r2', {
            status: 'open', kind: 'pickup', target_id: 'spot-9', target_name: '테스트 픽업', reason: 'closed'
        }));
        assert.strictEqual(sentLink(0).web_url, 'https://do.nulloongzi.com/?spot=spot-9');
    });

    test('web/mobile 링크가 같다', async () => {
        await fns.onReportCreated._handler(snapshotOf('reports/r3', {
            status: 'open', kind: 'club', target_id: 'c1', reason: 'other'
        }));
        const link = sentLink(0);
        assert.strictEqual(link.web_url, link.mobile_web_url);
    });

    // 알림 본문에 대상 이름이 남아 있어야 링크가 죽어도 운영자가 찾을 수 있다.
    test('본문에 대상 이름이 그대로 실린다', async () => {
        await fns.onReportCreated._handler(snapshotOf('reports/r4', {
            status: 'open', kind: 'club', target_id: 'c1', target_name: '석관중 배구부', reason: 'wrong_info'
        }));
        const text = JSON.parse(decodeURIComponent(sent[0].body.replace(/^template_object=/, ''))).text;
        assert.match(text, /석관중 배구부/);
    });
});

describe('인증 신청 알림 링크 (onVerificationCreated)', () => {
    test('신청한 팀으로 간다', async () => {
        await fns.onVerificationCreated._handler(snapshotOf('verification_requests/v1', {
            status: 'pending', club_name: '테스트팀', club_id: 'club-xyz'
        }));
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sentLink(0).web_url, 'https://do.nulloongzi.com/?club=club-xyz');
    });

    // 구글시트 시절 문서엔 club_id 가 없을 수 있다. 빈 ?club= 를 달면 착지 쪽이
    // 없는 팀을 찾느라 헛도므로 첫 화면으로 떨어져야 한다.
    test('club_id 가 없으면 첫 화면으로 떨어진다', async () => {
        await fns.onVerificationCreated._handler(snapshotOf('verification_requests/v2', {
            status: 'pending', club_name: '옛날팀'
        }));
        assert.strictEqual(sentLink(0).web_url, 'https://do.nulloongzi.com');
    });
});

describe('인증관리 카드 — 사진을 실제로 확인할 수 있나 (chatbotPending)', () => {
    // 운영자가 카톡에서 신청 사진을 눌러도 원본으로 못 갔다. 썸네일에 링크가 없어서다.
    // 관리자 권한 신청에도 같은 카드를 쓸 참이라, 증빙을 못 보면 승인 자체가 성립하지 않는다.
    const PHOTO = 'https://firebasestorage.example/v0/b/x/o/p.jpg?alt=media&token=abc';

    function pendingReq() {
        queryDocs['admin_kakao_ids'] = [];
        docs['admin_kakao_ids/kakao-1'] = { ok: true };
        queryDocs['verification_requests'] = [
            { id: 'req-1', data: { club_name: '테스트팀', photo_url: PHOTO, status: 'pending' } }
        ];
        return { body: { userRequest: { user: { id: 'kakao-1' } } } };
    }
    function capture() {
        let out = null;
        return { res: { json: (v) => { out = v; }, status() { return this; }, send() {} }, get: () => out };
    }
    async function card() {
        const c = capture();
        await fns.chatbotPending(pendingReq(), c.res);
        return c.get().template.outputs[0].carousel.items[0];
    }

    test('사진 원본으로 가는 버튼이 있다', async () => {
        const item = await card();
        const link = item.buttons.find((b) => b.action === 'webLink');
        assert.ok(link, 'webLink 버튼이 없다 — 운영자가 사진을 크게 볼 방법이 없다');
        assert.strictEqual(link.webLinkUrl, PHOTO);
    });

    test('썸네일을 눌러도 사진으로 간다', async () => {
        const item = await card();
        assert.strictEqual(item.thumbnail.link.web, PHOTO);
    });

    // 세로로 긴 단톡방 캡처가 잘리면 정작 봐야 할 부분이 사라진다.
    test('썸네일이 잘리지 않는다 (fixedRatio)', async () => {
        const item = await card();
        assert.strictEqual(item.thumbnail.fixedRatio, true);
    });

    // basicCard 버튼 상한이 3이라 더 늘리면 카드가 통째로 안 뜬다.
    test('버튼은 3개를 넘지 않는다', async () => {
        const item = await card();
        assert.ok(item.buttons.length <= 3, '버튼 ' + item.buttons.length + '개 — 카카오 상한 초과');
    });

    test('승인·거절 버튼은 그대로 남아 있다', async () => {
        const item = await card();
        const blocks = item.buttons.filter((b) => b.action === 'block');
        assert.strictEqual(blocks.length, 2);
        blocks.forEach((b) => assert.strictEqual(b.extra.request_id, 'req-1'));
    });
});

describe('관리자 권한 신청 (club_admin_requests)', () => {
    const PHOTO = 'https://firebasestorage.example/v0/b/x/o/kakao.png?alt=media&token=z';

    function capture() {
        let out = null;
        return { res: { json: (v) => { out = v; }, status() { return this; }, send() {} }, get: () => out };
    }
    const adminReq = () => ({ body: { userRequest: { user: { id: 'kakao-1' } }, action: {} } });
    function seedAdminCall(extra) {
        docs['admin_kakao_ids/kakao-1'] = { ok: true };
        const req = adminReq();
        req.body.action.clientExtra = extra;
        return req;
    }

    test('신청이 접수되면 그 팀으로 가는 알림이 나간다', async () => {
        await fns.onClubAdminRequestCreated._handler({
            data: {
                ref: makeRef('club_admin_requests/a1'),
                data: () => ({ status: 'pending', club_id: 'club-7', club_name: '테스트팀', photo_url: PHOTO })
            }
        });
        assert.strictEqual(sent.length, 1);
        const body = JSON.parse(decodeURIComponent(sent[0].body.replace(/^template_object=/, '')));
        assert.strictEqual(body.link.web_url, 'https://do.nulloongzi.com/?club=club-7');
        assert.match(body.text, /관리자관리/);
    });

    test('목록 카드에 사진 원본 버튼이 있고 썸네일이 안 잘린다', async () => {
        docs['admin_kakao_ids/kakao-1'] = { ok: true };
        queryDocs['club_admin_requests'] = [
            { id: 'r1', data: { status: 'pending', club_id: 'c1', club_name: '테스트팀', photo_url: PHOTO } }
        ];
        const c = capture();
        await fns.chatbotAdminRequests(adminReq(), c.res);
        const item = c.get().template.outputs[0].carousel.items[0];
        assert.strictEqual(item.thumbnail.fixedRatio, true);
        assert.strictEqual(item.buttons.find((b) => b.action === 'webLink').webLinkUrl, PHOTO);
        assert.ok(item.buttons.length <= 3, '카카오 basicCard 버튼 상한 초과');
    });

    test('비관리자는 목록을 볼 수 없다', async () => {
        delete docs['admin_kakao_ids/kakao-1'];
        const c = capture();
        await fns.chatbotAdminRequests(adminReq(), c.res);
        assert.match(c.get().template.outputs[0].simpleText.text, /권한이 없습니다/);
    });

    test('승인하면 admins 에 추가된다', async () => {
        docs['club_admin_requests/r1'] = { status: 'pending', club_id: 'c1', club_name: '팀', requested_by: 'u-new' };
        docs['clubs/c1'] = { name: '팀', admins: ['u-old'] };
        const c = capture();
        await fns.chatbotAdminApprove(seedAdminCall({ request_id: 'r1' }), c.res);
        assert.deepStrictEqual(docs['clubs/c1'].admins, ['u-old', 'u-new']);
        assert.strictEqual(docs['club_admin_requests/r1'].status, 'approved');
        assert.match(c.get().template.outputs[0].simpleText.text, /2\/3명/);
    });

    // 급소: 신청이 접수된 뒤 정원이 찼을 수 있다. 승인 시점에 다시 세지 않으면
    // 4명째가 들어가 정원이 무너진다.
    test('정원 3명이 찼으면 승인해도 넣지 않고 거절로 남긴다', async () => {
        docs['club_admin_requests/r2'] = { status: 'pending', club_id: 'c2', club_name: '팀', requested_by: 'u-4' };
        docs['clubs/c2'] = { name: '팀', admins: ['a', 'b', 'c'] };
        const c = capture();
        await fns.chatbotAdminApprove(seedAdminCall({ request_id: 'r2' }), c.res);
        assert.deepStrictEqual(docs['clubs/c2'].admins, ['a', 'b', 'c'], '정원을 넘겨 들어갔다');
        assert.strictEqual(docs['club_admin_requests/r2'].status, 'rejected');
        assert.strictEqual(docs['club_admin_requests/r2'].reject_reason, 'full');
    });

    test('이미 관리자면 중복으로 들어가지 않는다', async () => {
        docs['club_admin_requests/r3'] = { status: 'pending', club_id: 'c3', club_name: '팀', requested_by: 'a' };
        docs['clubs/c3'] = { name: '팀', admins: ['a'] };
        const c = capture();
        await fns.chatbotAdminApprove(seedAdminCall({ request_id: 'r3' }), c.res);
        assert.deepStrictEqual(docs['clubs/c3'].admins, ['a']);
    });

    test('거절하면 명단은 그대로', async () => {
        docs['club_admin_requests/r4'] = { status: 'pending', club_id: 'c4', club_name: '팀', requested_by: 'u-x' };
        docs['clubs/c4'] = { name: '팀', admins: ['a'] };
        const c = capture();
        await fns.chatbotAdminReject(seedAdminCall({ request_id: 'r4' }), c.res);
        assert.deepStrictEqual(docs['clubs/c4'].admins, ['a']);
        assert.strictEqual(docs['club_admin_requests/r4'].status, 'rejected');
    });

    // 비관리자가 승인 엔드포인트를 직접 때려도 권한이 넘어가면 안 된다.
    test('비관리자의 승인 호출은 아무것도 바꾸지 않는다', async () => {
        docs['club_admin_requests/r5'] = { status: 'pending', club_id: 'c5', club_name: '팀', requested_by: 'attacker' };
        docs['clubs/c5'] = { name: '팀', admins: ['a'] };
        delete docs['admin_kakao_ids/kakao-1'];
        const c = capture();
        const req = adminReq(); req.body.action.clientExtra = { request_id: 'r5' };
        await fns.chatbotAdminApprove(req, c.res);
        assert.deepStrictEqual(docs['clubs/c5'].admins, ['a']);
        assert.strictEqual(docs['club_admin_requests/r5'].status, 'pending');
    });
});

describe('인증 승인이 신청자를 관리자로 올린다', () => {
    // 배지만 주고 수정 권한을 안 주면, 정작 정보를 고칠 사람이 없는 팀이
    // 인증만 받은 채 남는다.
    test('chatbotApprove 가 requested_by 를 admins 에 넣는다', async () => {
        docs['admin_kakao_ids/kakao-1'] = { ok: true };
        docs['verification_requests/v1'] = {
            status: 'pending', club_id: 'cv1', club_name: '팀', requested_by: 'u-req'
        };
        docs['clubs/cv1'] = { name: '팀' };
        let out = null;
        const res = { json: (v) => { out = v; }, status() { return this; }, send() {} };
        const req = { body: { userRequest: { user: { id: 'kakao-1' } }, action: { clientExtra: { request_id: 'v1' } } } };
        await fns.chatbotApprove(req, res);
        assert.strictEqual(docs['clubs/cv1'].is_verified, true);
        assert.deepStrictEqual(docs['clubs/cv1'].admins, ['u-req']);
    });
});
