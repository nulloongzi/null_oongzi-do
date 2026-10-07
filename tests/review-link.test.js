// tests/review-link.test.js
// 알림에서 바로 심사 — 카카오 알림의 ✅승인 / ❌거절 버튼 → review.html → reviewRequest.
//
// 보는 것:
//  · 서명(pure.reviewToken)이 (종류, id) 에 묶여 있고 틀리면 아무것도 못 한다
//  · 확인 페이지가 부르는 reviewRequest 가 챗봇과 같은 결과를 낸다(인증 · 관리자 신청)
//  · 거절은 사유가 있어야 하고, 고른 사유가 그대로 남는다
//  · 관리자 신청 거절 사유 코드마다 웹·앱에 신청자가 볼 문장이 있다
//
// 실행: node --test tests/review-link.test.js

const { test, describe, before, after, beforeEach } = require('node:test');

const _quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };
before(() => {
    console.log = () => {}; console.warn = () => {};
    console.error = () => {}; console.info = () => {};
});

const assert = require('node:assert');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const SECRET = 'secret';
const pure = require(path.join(process.cwd(), 'functions', 'lib', 'pure.js'));

let docs = {};
function makeRef(p) {
    return {
        path: p,
        id: p.split('/').pop(),
        get: async () => ({ exists: Object.hasOwn(docs, p), id: p.split('/').pop(), data: () => docs[p] }),
        set: async (d) => { docs[p] = Object.assign({}, docs[p], d); },
        update: async (d) => {
            if (!Object.hasOwn(docs, p)) throw new Error('NOT_FOUND: ' + p);
            docs[p] = Object.assign({}, docs[p], d);
        },
        delete: async () => { delete docs[p]; }
    };
}
function makeCollection(name) {
    const snap = { empty: true, size: 0, docs: [], forEach() {} };
    const chain = { get: async () => snap, where: () => chain, limit: () => chain, orderBy: () => chain };
    return { doc: (id) => makeRef(name + '/' + id), add: async () => makeRef(name + '/new'), where: chain.where, limit: chain.limit, orderBy: chain.orderBy, get: chain.get };
}
const FieldValue = { serverTimestamp: () => '<ts>', delete: () => '<del>' };
let deletedObjects = [];
const BUCKET = 'nulloongzido.appspot.com';
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: makeCollection,
        batch: () => ({ delete() {}, commit: async () => {} }),
        runTransaction: async (fn) => fn({
            get: async (r) => r.get(),
            update: (r, d) => {
                if (!Object.hasOwn(docs, r.path)) throw new Error('NOT_FOUND: ' + r.path);
                docs[r.path] = Object.assign({}, docs[r.path], d);
            },
            set: (r, d) => { docs[r.path] = Object.assign({}, docs[r.path], d); }
        })
    }), { FieldValue, Timestamp: { now: () => '<now>' } }),
    storage: () => ({ bucket: () => ({ name: BUCKET, file: (p) => ({ delete: async () => { deletedObjects.push(p); } }) }) }),
    auth: () => ({ getUser: async () => ({ email: 'x@example.com', emailVerified: true }) })
};
const providerHttpStub = {
    KAPI_HOST: 'kapi.kakao.com', KAUTH_HOST: 'kauth.kakao.com',
    isOk: (s) => s >= 200 && s < 300, secretValue: () => SECRET,
    postForm: async () => ({ status: 200, body: '{}' }),
    getJson: async () => ({ status: 200, json: {} })
};
let reviewOpts = null;
const fnStubs = {
    'firebase-functions/v2/https': {
        onRequest: (o, h) => {
            if (o && Array.isArray(o.cors)) reviewOpts = o;   // reviewRequest 만 cors 목록을 쓴다
            return h;
        },
        onCall: (o, h) => (typeof o === 'function' ? o : h),
        HttpsError: class extends Error {}
    },
    'firebase-functions/v2/firestore': {
        onDocumentCreated: (o, h) => ({ _handler: h }), onDocumentWritten: (o, h) => ({ _handler: h }),
        onDocumentUpdated: (o, h) => ({ _handler: h }), onDocumentDeleted: (o, h) => ({ _handler: h })
    },
    'firebase-functions/v2/scheduler': { onSchedule: (o, h) => h },
    'firebase-functions/params': {
        defineSecret: (n) => ({ value: () => SECRET, name: n }),
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

beforeEach(() => { docs = {}; deletedObjects = []; });

const photoOf = (uid, name) => 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/'
    + encodeURIComponent('admin_request_photos/' + uid + '/' + name) + '?alt=media&token=t';

async function call(body, method) {
    const out = { code: 200, body: null };
    const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; } };
    await fns.reviewRequest({ method: method || 'POST', body: body, headers: {}, get: () => undefined }, res);
    return out;
}
const signed = (k, id, extra) => Object.assign({ k: k, id: id, t: pure.reviewToken(SECRET, k, id) }, extra || {});

describe('서명 (pure.reviewToken · reviewTokenOk)', () => {
    const t = pure.reviewToken(SECRET, 'admin', 'r1');
    test('맞는 서명은 통과', () => {
        assert.match(t, /^[0-9a-f]{32}$/);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'admin', 'r1', t), true);
    });
    test('다른 요청 · 다른 종류 · 다른 비밀로는 안 된다', () => {
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'admin', 'r2', t), false);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'verify', 'r1', t), false);
        assert.strictEqual(pure.reviewTokenOk('other', 'admin', 'r1', t), false);
    });
    test('비밀이 비었거나 값이 이상하면 거절', () => {
        assert.strictEqual(pure.reviewTokenOk('', 'admin', 'r1', pure.reviewToken('', 'admin', 'r1')), false);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'claim', 'r1', pure.reviewToken(SECRET, 'claim', 'r1')), false);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'admin', 'a/b', pure.reviewToken(SECRET, 'admin', 'a/b')), false);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'admin', 'r1', t.toUpperCase()), false);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'admin', 'r1', null), false);
        assert.strictEqual(pure.reviewTokenOk(SECRET, 'admin', 'r1', ['x']), false);
    });
    test('버튼은 비밀이 없으면 만들지 않는다(그땐 예전처럼 챗봇 안내만)', () => {
        assert.strictEqual(pure.reviewButtons('', 'admin', 'r1'), null);
        assert.strictEqual(pure.reviewButtons(SECRET, 'admin', ''), null);
        assert.strictEqual(pure.reviewButtons(SECRET, 'admin', 'r1').length, 2);
    });
});

describe('reviewRequest — 들어오는 문', () => {
    test('확인 페이지 도메인만 cors 로 연다', () => {
        assert.deepStrictEqual(reviewOpts.cors, ['https://do.nulloongzi.com']);
        assert.strictEqual(reviewOpts.invoker, 'public');
    });
    test('POST 만 받는다', async () => {
        const r = await call(signed('admin', 'r1'), 'GET');
        assert.strictEqual(r.code, 405);
    });
    test('서명이 틀리면 403, 아무것도 안 바뀐다', async () => {
        docs['club_admin_requests/r1'] = { status: 'pending', club_id: 'c1', requested_by: 'u1' };
        docs['clubs/c1'] = { name: '팀', admins: [] };
        const r = await call({ k: 'admin', id: 'r1', t: pure.reviewToken(SECRET, 'admin', 'r2'), op: 'approve' });
        assert.strictEqual(r.code, 403);
        assert.strictEqual(docs['club_admin_requests/r1'].status, 'pending');
        assert.deepStrictEqual(docs['clubs/c1'].admins, []);
    });
    test('모르는 op 는 400', async () => {
        docs['club_admin_requests/r1'] = { status: 'pending' };
        const r = await call(signed('admin', 'r1', { op: 'delete' }));
        assert.strictEqual(r.code, 400);
    });
});

describe('reviewRequest — 관리자 신청', () => {
    beforeEach(() => {
        docs['club_admin_requests/r1'] = {
            status: 'pending', club_id: 'c1', club_name: '누룽지팀', requested_by: 'u-new',
            photo_url: photoOf('u-new', 'p.jpg'), requested_at: { toMillis: () => 1000 }
        };
        docs['clubs/c1'] = { name: '누룽지팀', admins: ['u-old'] };
    });

    test('info: 팀 · 사진 · 지금 관리자 수 · 고를 사유', async () => {
        const r = await call(signed('admin', 'r1', { op: 'info' }));
        assert.strictEqual(r.code, 200);
        const d = r.body;
        assert.strictEqual(d.found, true);
        assert.strictEqual(d.club_name, '누룽지팀');
        assert.strictEqual(d.club_url, 'https://do.nulloongzi.com/?club=c1');
        assert.strictEqual(d.photo_url, photoOf('u-new', 'p.jpg'));
        assert.strictEqual(d.admin_count, 1);
        assert.strictEqual(d.admin_max, 3);
        assert.deepStrictEqual(d.reasons.map((x) => x.code), ['photo_unclear', 'photo_unrelated', 'duplicate', 'other']);
    });

    test('승인: 명단에 들어가고 사진을 지운다 — 챗봇 승인과 같은 결과', async () => {
        const r = await call(signed('admin', 'r1', { op: 'approve' }));
        assert.strictEqual(r.body.outcome, 'approved');
        assert.deepStrictEqual(docs['clubs/c1'].admins, ['u-old', 'u-new']);
        assert.strictEqual(docs['club_admin_requests/r1'].status, 'approved');
        assert.deepStrictEqual(deletedObjects, ['admin_request_photos/u-new/p.jpg']);
        assert.match(r.body.message, /승인했어요[\s\S]*2\/3명/);
    });

    test('거절은 사유가 있어야 한다 — 없으면 아무것도 안 바뀐다', async () => {
        for (const reason of [undefined, '', 'full', 'error']) {
            const r = await call(signed('admin', 'r1', { op: 'reject', reason: reason }));
            assert.strictEqual(r.body.outcome, 'need_reason', String(reason));
        }
        assert.strictEqual(docs['club_admin_requests/r1'].status, 'pending');
        assert.deepStrictEqual(deletedObjects, []);
    });

    test('거절: 고른 사유가 남고 명단은 그대로', async () => {
        const r = await call(signed('admin', 'r1', { op: 'reject', reason: 'photo_unclear' }));
        assert.strictEqual(r.body.outcome, 'rejected');
        assert.strictEqual(docs['club_admin_requests/r1'].status, 'rejected');
        assert.strictEqual(docs['club_admin_requests/r1'].reject_reason, 'photo_unclear');
        assert.deepStrictEqual(docs['clubs/c1'].admins, ['u-old']);
        assert.match(r.body.message, /사유: 사진으로 확인 안 됨/);
    });

    test('처리된 뒤 다시 열면 결과만 보이고, 다시 눌러도 "이미 처리"', async () => {
        await call(signed('admin', 'r1', { op: 'reject', reason: 'other' }));
        const info = await call(signed('admin', 'r1', { op: 'info' }));
        assert.strictEqual(info.body.status, 'rejected');
        assert.strictEqual(info.body.reject_reason, 'other');
        assert.strictEqual(info.body.photo_url, '', '결정 뒤에는 사진을 내보내지 않는다');
        const again = await call(signed('admin', 'r1', { op: 'approve' }));
        assert.strictEqual(again.body.outcome, 'done');
        assert.deepStrictEqual(docs['clubs/c1'].admins, ['u-old']);
    });

    test('없는 신청은 found:false', async () => {
        const r = await call(signed('admin', 'nope', { op: 'info' }));
        assert.strictEqual(r.body.found, false);
    });
});

describe('reviewRequest — 팀 인증 신청', () => {
    beforeEach(() => {
        docs['verification_requests/v1'] = {
            status: 'pending', club_id: 'c1', club_name: '누룽지팀', requested_by: 'u-v', photo_url: 'https://x/p.jpg'
        };
        docs['clubs/c1'] = { name: '누룽지팀', admins: [] };
    });

    test('info: 인증 거절 사유는 챗봇과 같은 글자 목록', async () => {
        const r = await call(signed('verify', 'v1', { op: 'info' }));
        assert.strictEqual(r.body.kind, 'verify');
        assert.deepStrictEqual(r.body.reasons.map((x) => x.code), pure.VERIFY_REJECT_REASONS);
        assert.strictEqual(r.body.admin_count, undefined);
    });

    test('승인: 배지가 붙고 신청자가 관리자가 된다', async () => {
        const r = await call(signed('verify', 'v1', { op: 'approve' }));
        assert.strictEqual(r.body.outcome, 'approved');
        assert.strictEqual(docs['clubs/c1'].is_verified, true);
        assert.ok(docs['clubs/c1'].admins.includes('u-v'));
        assert.strictEqual(docs['verification_requests/v1'].status, 'approved');
    });

    test('팀이 없어졌으면 거절로 닫는다', async () => {
        delete docs['clubs/c1'];
        const r = await call(signed('verify', 'v1', { op: 'approve' }));
        assert.strictEqual(r.body.outcome, 'rejected');
        assert.strictEqual(docs['verification_requests/v1'].reject_reason, 'club_missing');
        assert.ok(!Object.hasOwn(docs, 'clubs/c1'), '없는 팀 문서를 만들면 안 된다');
    });

    test('거절: 목록에 있는 사유만, 그대로 남긴다', async () => {
        const bad = await call(signed('verify', 'v1', { op: 'reject', reason: '<script>' }));
        assert.strictEqual(bad.body.outcome, 'need_reason');
        assert.strictEqual(docs['verification_requests/v1'].status, 'pending');
        const r = await call(signed('verify', 'v1', { op: 'reject', reason: '사진 불분명' }));
        assert.strictEqual(r.body.outcome, 'rejected');
        assert.strictEqual(docs['verification_requests/v1'].reject_reason, '사진 불분명');
        assert.notStrictEqual(docs['clubs/c1'].is_verified, true);
    });

    test('관리자 신청 서명으로 인증 신청을 처리할 수 없다', async () => {
        const r = await call({ k: 'verify', id: 'v1', t: pure.reviewToken(SECRET, 'admin', 'v1'), op: 'approve' });
        assert.strictEqual(r.code, 403);
        assert.strictEqual(docs['verification_requests/v1'].status, 'pending');
    });
});

describe('관리자 신청 거절 사유 — 신청자가 볼 문장이 웹·앱에 다 있다', () => {
    const ROOT = process.cwd();
    const i18n = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
    const detail = fs.readFileSync(path.join(ROOT, 'js', 'club-detail.js'), 'utf8');
    const appStrings = path.join(ROOT, '..', 'null_oongzi-do-app', 'lib', 'l10n', 'strings.dart');
    const appCodes = path.join(ROOT, '..', 'null_oongzi-do-app', 'lib', 'services', 'club_admin.dart');

    test('운영자가 고르는 사유는 모두 서버가 남길 수 있는 코드다', () => {
        pure.ADMIN_MANUAL_REJECT_REASONS.forEach((r) => {
            assert.strictEqual(pure.adminRejectReason(r.code), r.code, r.code);
        });
    });
    pure.ADMIN_REJECT_REASONS.forEach((code) => {
        test('웹: ' + code, () => {
            assert.ok(new RegExp("\\bad_reason_" + code + ":\\s*\\{\\s*ko:").test(i18n), 'i18n.js ad_reason_' + code);
            assert.ok(new RegExp("\\b" + code + ":\\s*'ad_reason_" + code + "'").test(detail), 'club-detail.js 매핑 ' + code);
        });
        // 앱 저장소가 옆에 있을 때만(CI 웹 잡은 웹만 체크아웃한다)
        test('앱: ' + code, { skip: !fs.existsSync(appStrings) }, () => {
            assert.ok(fs.readFileSync(appStrings, 'utf8').includes("'ad_reason_" + code + "'"), 'strings.dart ad_reason_' + code);
            assert.ok(fs.readFileSync(appCodes, 'utf8').includes("'" + code + "'"), 'club_admin.dart 코드 ' + code);
        });
    });
});
