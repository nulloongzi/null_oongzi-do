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
        set: async () => {}, update: async () => {}, delete: async () => {}
    };
}
const emptyQuery = { get: async () => ({ empty: true, size: 0, docs: [], forEach() {} }) };
function makeCollection(name) {
    return {
        doc: (id) => makeRef(name + '/' + id),
        add: async () => makeRef(name + '/new'),
        where: () => ({ ...emptyQuery, where: () => emptyQuery, limit: () => emptyQuery }),
        limit: () => emptyQuery,
        get: emptyQuery.get
    };
}

const FieldValue = { serverTimestamp: () => '<ts>', delete: () => '<del>' };
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({ collection: makeCollection, batch: () => ({ delete() {}, commit: async () => {} }) }),
        { FieldValue, Timestamp: { now: () => '<now>' } }),
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

// 토큰 갱신 경로를 타지 않도록 유효한 access token 을 캐시에 심어둔다.
beforeEach(() => {
    sent = [];
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
