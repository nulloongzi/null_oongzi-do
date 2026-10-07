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
// txFail 을 켜면 트랜잭션이 통째로 실패한다(경합 끝에 포기한 경우). 실제
// Firestore 처럼 아무것도 쓰이지 않아야 하므로 fn 을 부르기 전에 던진다.
let txFail = false;
// 지운 Storage 객체 경로. deleteFail 을 켜면 삭제가 실패한다.
let deletedObjects = [];
let deleteFail = false;
const BUCKET = 'nulloongzido.appspot.com';
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: makeCollection,
        batch: () => ({ delete() {}, commit: async () => {} }),
        runTransaction: async (fn) => {
            if (txFail) throw new Error('ABORTED: too much contention');
            return fn(makeTx());
        }
    }), { FieldValue, Timestamp: { now: () => '<now>' } }),
    storage: () => ({
        bucket: () => ({
            name: BUCKET,
            file: (p) => ({
                delete: async () => {
                    if (deleteFail) throw new Error('storage down');
                    deletedObjects.push(p);
                }
            })
        })
    }),
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
    'firebase-functions/v2/scheduler': { onSchedule: (o, h) => h },
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
const pure = require(path.join(process.cwd(), 'functions', 'lib', 'pure.js'));
Module._load = origLoad;

after(() => { Object.assign(console, _quiet); });

// 토큰 갱신 경로를 타지 않도록 유효한 access token 을 캐시에 심어둔다.
beforeEach(() => {
    sent = [];
    queryDocs = {};
    txFail = false;
    deletedObjects = [];
    deleteFail = false;
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
    test('알림에 ✅승인 / ❌거절 버튼이 붙는다 (k=verify)', async () => {
        await fns.onVerificationCreated._handler({
            params: { requestId: 'v9' },
            data: { ref: makeRef('verification_requests/v9'), data: () => ({ status: 'pending', club_id: 'c9', club_name: '팀9' }) }
        });
        const body = JSON.parse(decodeURIComponent(sent[0].body.replace(/^template_object=/, '')));
        const u = new URL(body.buttons[1].link.web_url);
        assert.strictEqual(u.searchParams.get('k'), 'verify');
        assert.strictEqual(u.searchParams.get('a'), 'reject');
        assert.ok(pure.reviewTokenOk('secret', 'verify', 'v9', u.searchParams.get('t')));
        assert.match(body.text, /인증관리/);
    });

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

    // 챗봇에 '관리자관리'를 치지 않고도 알림에서 바로 심사한다. 버튼은 우리 사이트의
    // 확인 페이지로 가고(카카오는 등록된 도메인만 연다), 링크에 서명이 실린다.
    test('알림에 ✅승인 / ❌거절 버튼이 붙고, 서명된 확인 페이지로 간다', async () => {
        await fns.onClubAdminRequestCreated._handler({
            params: { requestId: 'a1' },
            data: {
                ref: makeRef('club_admin_requests/a1'),
                data: () => ({ status: 'pending', club_id: 'club-7', club_name: '테스트팀', photo_url: PHOTO })
            }
        });
        const body = JSON.parse(decodeURIComponent(sent[0].body.replace(/^template_object=/, '')));
        assert.strictEqual(body.buttons.length, 2);
        const [ok, no] = body.buttons;
        assert.match(ok.title, /승인/);
        assert.match(no.title, /거절/);
        const u = new URL(ok.link.web_url);
        assert.strictEqual(u.origin + u.pathname, 'https://do.nulloongzi.com/review.html');
        assert.strictEqual(u.searchParams.get('k'), 'admin');
        assert.strictEqual(u.searchParams.get('id'), 'a1');
        assert.strictEqual(u.searchParams.get('a'), 'approve');
        assert.ok(pure.reviewTokenOk('secret', 'admin', 'a1', u.searchParams.get('t')));
        assert.strictEqual(new URL(no.link.web_url).searchParams.get('a'), 'reject');
        assert.strictEqual(ok.link.web_url, ok.link.mobile_web_url);
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
        assert.match(c.get().template.outputs[0].simpleText.text, /운영자만 쓸 수 있는/);
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
        await fns.chatbotAdminReject(seedAdminCall({ request_id: 'r4', reason: 'photo_unclear' }), c.res);
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

describe('관리자 신청 — 한 트랜잭션 처리 · 중복 거르기 · 사진 정리', () => {
    const photoOf = (uid, name) => 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/'
        + encodeURIComponent('admin_request_photos/' + uid + '/' + name) + '?alt=media&token=t';
    function capture() {
        let out = null;
        return { res: { json: (v) => { out = v; }, status() { return this; }, send() {} }, get: () => out };
    }
    const textOf = (c) => c.get().template.outputs[0].simpleText.text;
    function call(extra) {
        docs['admin_kakao_ids/kakao-1'] = { ok: true };
        return { body: { userRequest: { user: { id: 'kakao-1' } }, action: { clientExtra: extra } } };
    }
    const ts = (ms) => ({ toMillis: () => ms });
    async function created(id, data) {
        docs['club_admin_requests/' + id] = data;
        await fns.onClubAdminRequestCreated._handler({
            data: { ref: makeRef('club_admin_requests/' + id), data: () => data }
        });
    }

    test('두 번 눌러도 한 번만 들어가고 두 번째는 "이미 처리"', async () => {
        docs['club_admin_requests/q1'] = { status: 'pending', club_id: 'k1', club_name: '팀', requested_by: 'u-new', photo_url: photoOf('u-new', 'a.jpg') };
        docs['clubs/k1'] = { name: '팀', admins: ['u-old'] };
        await fns.chatbotAdminApprove(call({ request_id: 'q1' }), capture().res);
        const c2 = capture();
        await fns.chatbotAdminApprove(call({ request_id: 'q1' }), c2.res);
        assert.deepStrictEqual(docs['clubs/k1'].admins, ['u-old', 'u-new']);
        assert.match(textOf(c2), /이미 처리된/);
    });

    test('승인 뒤 거절이 와도 승인이 그대로', async () => {
        docs['club_admin_requests/q2'] = { status: 'pending', club_id: 'k2', club_name: '팀', requested_by: 'u-new' };
        docs['clubs/k2'] = { name: '팀', admins: [] };
        await fns.chatbotAdminApprove(call({ request_id: 'q2' }), capture().res);
        const c = capture();
        await fns.chatbotAdminReject(call({ request_id: 'q2', reason: 'other' }), c.res);
        assert.strictEqual(docs['club_admin_requests/q2'].status, 'approved');
        // admins: [] 는 관리자 없음 — 등록자가 되살아나지 않고 새 사람만
        assert.deepStrictEqual(docs['clubs/k2'].admins, ['u-new']);
        assert.match(textOf(c), /이미 처리된/);
    });

    // 오류를 '거절(error)'로 남기면 신청자에게 거절이 뜬다. 다시 누르면 될 일이다.
    test('트랜잭션이 실패하면 신청은 pending 그대로, 다시 하라고 안내', async () => {
        docs['club_admin_requests/q3'] = { status: 'pending', club_id: 'k3', club_name: '팀', requested_by: 'u-new', photo_url: photoOf('u-new', 'a.jpg') };
        docs['clubs/k3'] = { name: '팀', admins: ['a'] };
        txFail = true;
        const c = capture();
        await fns.chatbotAdminApprove(call({ request_id: 'q3' }), c.res);
        assert.strictEqual(docs['club_admin_requests/q3'].status, 'pending');
        assert.ok(!('reject_reason' in docs['club_admin_requests/q3']));
        assert.deepStrictEqual(docs['clubs/k3'].admins, ['a']);
        assert.deepStrictEqual(deletedObjects, [], '결정 전에 사진을 지웠다');
        assert.match(textOf(c), /다시/);
    });

    test('팀이 없으면 not_found 로 거절', async () => {
        docs['club_admin_requests/q4'] = { status: 'pending', club_id: 'gone', club_name: '팀', requested_by: 'u-new' };
        await fns.chatbotAdminApprove(call({ request_id: 'q4' }), capture().res);
        assert.strictEqual(docs['club_admin_requests/q4'].status, 'rejected');
        assert.strictEqual(docs['club_admin_requests/q4'].reject_reason, 'not_found');
    });

    // 거절 사유를 신청자가 본다(앱·웹 ad_reason_*). 사유 없이 눌리면 먼저 사유를 고르게 한다.
    test('사유 없이 거절을 누르면 사유 버튼만 보이고 아무것도 안 바뀐다', async () => {
        docs['club_admin_requests/q5'] = { status: 'pending', club_id: 'k5', club_name: '팀', requested_by: 'u-x' };
        const c = capture();
        await fns.chatbotAdminReject(call({ request_id: 'q5' }), c.res);
        assert.strictEqual(docs['club_admin_requests/q5'].status, 'pending');
        const qr = c.get().template.quickReplies;
        assert.deepStrictEqual(qr.map((q) => q.extra.reason), ['photo_unclear', 'photo_unrelated', 'duplicate', 'other']);
        // 같은 '관리자거절' 블록으로 사유를 싣고 다시 들어온다 — 새 블록이 필요 없다.
        assert.ok(qr.every((q) => q.action === 'block' && q.blockId === 'blk-reject' && q.extra.request_id === 'q5'));
    });

    test('고른 사유를 reject_reason 에 남긴다', async () => {
        docs['club_admin_requests/q5'] = { status: 'pending', club_id: 'k5', club_name: '팀', requested_by: 'u-x' };
        const c = capture();
        await fns.chatbotAdminReject(call({ request_id: 'q5', reason: 'photo_unrelated' }), c.res);
        assert.strictEqual(docs['club_admin_requests/q5'].status, 'rejected');
        assert.strictEqual(docs['club_admin_requests/q5'].reject_reason, 'photo_unrelated');
        assert.match(textOf(c), /거절했어요[\s\S]*사유: 관련 없는 사진/);
    });

    test('모르는 사유(서버 전용 코드 포함)는 받지 않고 다시 고르게 한다', async () => {
        docs['club_admin_requests/q5'] = { status: 'pending', club_id: 'k5', club_name: '팀', requested_by: 'u-x' };
        for (const bad of ['full', 'error', '<b>x</b>']) {
            const c = capture();
            await fns.chatbotAdminReject(call({ request_id: 'q5', reason: bad }), c.res);
            assert.strictEqual(docs['club_admin_requests/q5'].status, 'pending', bad);
            assert.ok(c.get().template.quickReplies.length === 4, bad);
        }
    });

    test('이미 처리된 신청에 거절을 누르면 사유 버튼 없이 "이미 처리"', async () => {
        docs['club_admin_requests/q5'] = { status: 'approved', club_id: 'k5', club_name: '팀', requested_by: 'u-x' };
        const c = capture();
        await fns.chatbotAdminReject(call({ request_id: 'q5' }), c.res);
        assert.match(textOf(c), /이미 처리/);
    });

    test('승인·거절하면 증빙 사진을 지우고 photo_deleted_at 을 남긴다', async () => {
        docs['club_admin_requests/q6'] = { status: 'pending', club_id: 'k6', club_name: '팀', requested_by: 'u6', photo_url: photoOf('u6', 'p.jpg') };
        docs['club_admin_requests/q7'] = { status: 'pending', club_id: 'k6', club_name: '팀', requested_by: 'u7', photo_url: photoOf('u7', 'q.jpg') };
        docs['clubs/k6'] = { name: '팀', admins: [] };
        await fns.chatbotAdminApprove(call({ request_id: 'q6' }), capture().res);
        await fns.chatbotAdminReject(call({ request_id: 'q7', reason: 'other' }), capture().res);
        assert.deepStrictEqual(deletedObjects, ['admin_request_photos/u6/p.jpg', 'admin_request_photos/u7/q.jpg']);
        assert.strictEqual(docs['club_admin_requests/q6'].photo_deleted_at, '<ts>');
        assert.strictEqual(docs['club_admin_requests/q7'].photo_deleted_at, '<ts>');
    });

    test('남의 폴더·인증 사진을 가리키는 URL 은 지우지 않는다', async () => {
        const verif = 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/'
            + encodeURIComponent('verification_photos/u8/v.jpg') + '?alt=media';
        docs['club_admin_requests/q8'] = { status: 'pending', club_id: 'k8', requested_by: 'u8', photo_url: verif };
        docs['club_admin_requests/q9'] = { status: 'pending', club_id: 'k8', requested_by: 'u9', photo_url: photoOf('victim', 'v.jpg') };
        await fns.chatbotAdminReject(call({ request_id: 'q8', reason: 'other' }), capture().res);
        await fns.chatbotAdminReject(call({ request_id: 'q9', reason: 'other' }), capture().res);
        assert.deepStrictEqual(deletedObjects, []);
        assert.strictEqual(docs['club_admin_requests/q8'].status, 'rejected');
        assert.ok(!('photo_deleted_at' in docs['club_admin_requests/q8']));
    });

    test('사진 삭제가 실패해도 결정은 그대로', async () => {
        docs['club_admin_requests/q10'] = { status: 'pending', club_id: 'k10', club_name: '팀', requested_by: 'u10', photo_url: photoOf('u10', 'p.jpg') };
        docs['clubs/k10'] = { name: '팀', admins: [] };
        deleteFail = true;
        const c = capture();
        await fns.chatbotAdminApprove(call({ request_id: 'q10' }), c.res);
        assert.strictEqual(docs['club_admin_requests/q10'].status, 'approved');
        assert.deepStrictEqual(docs['clubs/k10'].admins, ['u10']);
        assert.ok(!('photo_deleted_at' in docs['club_admin_requests/q10']));
        assert.match(textOf(c), /승인했어요/);
    });

    test('같은 팀에 먼저 낸 신청이 대기 중이면 새 신청은 duplicate 로 닫고 알리지 않는다', async () => {
        queryDocs['club_admin_requests'] = [
            { id: 'first', data: { status: 'pending', club_id: 'd1', requested_by: 'ud', requested_at: ts(1000) } }
        ];
        docs['clubs/d1'] = { name: '팀', admins: [] };
        await created('second', { status: 'pending', club_id: 'd1', club_name: '팀', requested_by: 'ud', requested_at: ts(2000), photo_url: photoOf('ud', 's.jpg') });
        assert.strictEqual(sent.length, 0, '중복인데 운영자에게 알렸다');
        assert.strictEqual(docs['club_admin_requests/second'].status, 'rejected');
        assert.strictEqual(docs['club_admin_requests/second'].reject_reason, 'duplicate');
        assert.strictEqual(docs['club_admin_requests/second'].reviewed_at, '<ts>');
        assert.deepStrictEqual(deletedObjects, ['admin_request_photos/ud/s.jpg']);
    });

    test('먼저 낸 쪽은 나중 것이 있어도 그대로 알린다', async () => {
        queryDocs['club_admin_requests'] = [
            { id: 'later', data: { status: 'pending', club_id: 'd2', requested_by: 'ud', requested_at: ts(5000) } }
        ];
        await created('earlier', { status: 'pending', club_id: 'd2', club_name: '팀', requested_by: 'ud', requested_at: ts(1000), photo_url: photoOf('ud', 'e.jpg') });
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(docs['club_admin_requests/earlier'].status, 'pending');
    });

    test('다른 팀 신청·끝난 신청은 중복이 아니다', async () => {
        queryDocs['club_admin_requests'] = [
            { id: 'o1', data: { status: 'pending', club_id: 'other', requested_by: 'ud', requested_at: ts(1) } },
            { id: 'o2', data: { status: 'rejected', club_id: 'd3', requested_by: 'ud', requested_at: ts(1) } }
        ];
        await created('n3', { status: 'pending', club_id: 'd3', club_name: '팀', requested_by: 'ud', requested_at: ts(9) });
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(docs['club_admin_requests/n3'].status, 'pending');
    });

    test('이미 그 팀 관리자면 already_admin 으로 닫고 알리지 않는다', async () => {
        docs['clubs/d4'] = { name: '팀', admins: ['ud'] };
        await created('n4', { status: 'pending', club_id: 'd4', club_name: '팀', requested_by: 'ud', requested_at: ts(9) });
        assert.strictEqual(sent.length, 0);
        assert.strictEqual(docs['club_admin_requests/n4'].status, 'rejected');
        assert.strictEqual(docs['club_admin_requests/n4'].reject_reason, 'already_admin');
    });

    test('목록 카드: 사진이 없거나 지워진 신청도 깨지지 않는다', async () => {
        docs['admin_kakao_ids/kakao-1'] = { ok: true };
        queryDocs['club_admin_requests'] = [
            { id: 'np', data: { status: 'pending', club_id: 'c1', club_name: '사진없음' } },
            { id: 'gone', data: { status: 'pending', club_id: 'c2', club_name: '지움', photo_url: photoOf('u', 'x.jpg'), photo_deleted_at: '<ts>' } }
        ];
        const c = capture();
        await fns.chatbotAdminRequests({ body: { userRequest: { user: { id: 'kakao-1' } }, action: {} } }, c.res);
        const items = c.get().template.outputs[0].carousel.items;
        items.forEach((item) => {
            assert.ok(item.thumbnail.imageUrl, '썸네일이 비었다');
            assert.ok(!item.buttons.some((b) => b.action === 'webLink'), '죽은 사진 링크 버튼');
            assert.ok(item.buttons.some((b) => /승인/.test(b.label)));
        });
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
