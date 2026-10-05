// tests/urgent-functions.test.js
// postUrgent(callable) · sweepClubFlags(매시간 정리) — index.js 를 가짜 Firestore 위에서 돌린다.
// 판정 자체는 tests/urgent.test.js 가 pure.js 로 본다. 여기선 "무엇을 어디에 쓰나"를 본다:
//   · 급구 켜기는 팀 문서 + urgent_log 를 한 트랜잭션에 쓴다
//   · 실패는 HttpsError details.reason 으로 이유를 준다(화면이 ug_err_<reason> 로 바꾼다)
//   · 정리는 끄기·기한 붙이기·모집 끄기를 하고, 급구 쪽은 기록을 남긴다
// 실행: node --test tests/urgent-functions.test.js

const { test, describe, before, after, beforeEach } = require('node:test');

// index.js 의 console 출력이 러너 stdout 과 섞이면 파일 전체가 유령 실패한다(claim-dedupe 참고).
const _quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };
before(() => {
    console.log = () => {}; console.warn = () => {};
    console.error = () => {}; console.info = () => {};
});

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

let docs = {};
let autoSeq = 0;
let batchCommits = [];
const DEL = '<del>';
const TS = '<ts>';

function applyWrite(p, d, merge) {
    const next = merge ? Object.assign({}, docs[p]) : {};
    Object.keys(d).forEach((k) => { if (d[k] === DEL) delete next[k]; else next[k] = d[k]; });
    docs[p] = next;
}
function makeRef(p) {
    const id = p.split('/').pop();
    return {
        path: p, id,
        get: async () => ({ exists: Object.hasOwn(docs, p), id, ref: makeRef(p), data: () => docs[p] }),
        collection: (name) => makeCollection(p + '/' + name)
    };
}
// where() 는 실제 Firestore 처럼 **새** 쿼리를 돌려준다(같은 컬렉션에 조건이 쌓이지 않게).
function makeCollection(name, filters) {
    const depth = name.split('/').length + 1;
    filters = filters || [];
    const chain = {
        doc: (id) => makeRef(name + '/' + (id || 'auto' + (++autoSeq))),
        where: (f, op, v) => makeCollection(name, filters.concat([[f, v]])),
        get: async () => {
            const list = Object.keys(docs)
                .filter((k) => k.startsWith(name + '/') && k.split('/').length === depth)
                .filter((k) => filters.every(([f, v]) => docs[k][f] === v))
                .map((k) => ({ id: k.split('/').pop(), ref: makeRef(k), updateTime: '<t:' + k + '>', data: () => docs[k] }));
            return { docs: list, size: list.length, forEach: (fn) => list.forEach(fn) };
        }
    };
    return chain;
}
class HttpsError extends Error {
    constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const Timestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };
const adminStub = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: (n) => makeCollection(n),
        batch: () => {
            const ops = [];
            return {
                set: (r, d) => ops.push(['set', r.path, d]),
                update: (r, d, pre) => ops.push(['update', r.path, d, pre]),
                delete: (r) => ops.push(['delete', r.path]),
                commit: async () => {
                    batchCommits.push(ops);
                    ops.forEach(([kind, p, d]) => { if (kind === 'set') applyWrite(p, d, false); else if (kind === 'update') applyWrite(p, d, true); });
                }
            };
        },
        runTransaction: async (fn) => {
            const pending = [];
            const out = await fn({
                get: async (r) => r.get(),
                update: (r, d) => pending.push([r.path, d, true]),
                set: (r, d) => pending.push([r.path, d, false])
            });
            pending.forEach(([p, d, merge]) => applyWrite(p, d, merge));
            return out;
        }
    }), { FieldValue: { serverTimestamp: () => TS, delete: () => DEL }, Timestamp }),
    auth: () => ({})
};
const fnStubs = {
    'firebase-functions/v2/https': { onRequest: (o, h) => h, onCall: (o, h) => (typeof o === 'function' ? o : h), HttpsError },
    'firebase-functions/v2/firestore': {
        onDocumentCreated: (o, h) => ({ _handler: h }), onDocumentWritten: (o, h) => ({ _handler: h }),
        onDocumentUpdated: (o, h) => ({ _handler: h }), onDocumentDeleted: (o, h) => ({ _handler: h })
    },
    'firebase-functions/v2/scheduler': { onSchedule: (o, h) => ({ _opts: o, _handler: h }) },
    'firebase-functions/params': {
        defineSecret: (n) => ({ value: () => 'secret', name: n }),
        defineString: (n, o) => ({ value: () => (o && o.default) || '', name: n })
    }
};
const origLoad = Module._load;
Module._load = function (req) {
    if (Object.hasOwn(fnStubs, req)) return fnStubs[req];
    if (req === 'firebase-admin') return adminStub;
    if (req === './lib/provider-http') return {};
    return origLoad.apply(this, arguments);
};
const fns = require(path.join(process.cwd(), 'functions', 'index.js'));
Module._load = origLoad;
after(() => { Object.assign(console, _quiet); });

const H = 3600 * 1000;
const D = 24 * H;
const logsOf = (club) => Object.keys(docs).filter((k) => k.startsWith('clubs/' + club + '/urgent_log/')).map((k) => docs[k]);

beforeEach(() => {
    docs = {};
    batchCommits = [];
    docs['clubs/c1'] = { name: '가나배구', is_verified: true, admins: ['m1'] };
    docs['admins/op'] = { role: 'operator' };
});

function post(data, auth) {
    return fns.postUrgent({
        auth: auth === undefined ? { uid: 'm1', token: { firebase: { sign_in_provider: 'google.com' } } } : auth,
        data
    });
}
async function reasonOf(p) {
    try { await p; } catch (e) { return [e.code, e.details && e.details.reason]; }
    return null;
}

describe('postUrgent', () => {
    test('관리자 → 팀 문서 + urgent_log 를 함께 쓴다', async () => {
        const until = Date.now() + 3 * H;
        const res = await post({ clubId: 'c1', until, msg: '  센터 1명  ' });
        assert.deepStrictEqual(res, { status: 'ok', until });
        const c = docs['clubs/c1'];
        assert.strictEqual(c.is_urgent, true);
        assert.strictEqual(c.urgent_msg, '센터 1명');
        assert.strictEqual(c.urgent_until.toMillis(), until);
        assert.strictEqual(c.urgent_at, TS);
        const logs = logsOf('c1');
        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].action, 'post');
        assert.strictEqual(logs[0].uid, 'm1');
        assert.strictEqual(logs[0].msg, '센터 1명');
        assert.strictEqual(logs[0].until.toMillis(), until);
    });
    test('운영자는 관리자가 아니어도 올린다', async () => {
        await post({ clubId: 'c1', until: Date.now() + H, msg: '공지' }, { uid: 'op', token: { firebase: { sign_in_provider: 'password' } } });
        assert.strictEqual(docs['clubs/c1'].is_urgent, true);
    });
    test('로그인 없음 · 익명 → unauthenticated/login', async () => {
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'c1', until: Date.now() + H, msg: 'x' }, null)), ['unauthenticated', 'login']);
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'c1', until: Date.now() + H, msg: 'x' },
            { uid: 'm1', token: { firebase: { sign_in_provider: 'anonymous' } } })), ['unauthenticated', 'login']);
    });
    test('형식이 틀리면 bad_input', async () => {
        for (const d of [{}, { clubId: 'c1', until: '1', msg: 'x' }, { clubId: '', until: 1, msg: 'x' },
            { clubId: 'c1', until: Date.now() + H }, { clubId: 'c1', until: Infinity, msg: 'x' }]) {
            assert.deepStrictEqual(await reasonOf(post(d)), ['invalid-argument', 'bad_input']);
        }
    });
    test('팀 없음 → not_found', async () => {
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'nope', until: Date.now() + H, msg: 'x' })), ['not-found', 'not_found']);
    });
    test('관리자 아님 → permission-denied/not_manager', async () => {
        const r = await reasonOf(post({ clubId: 'c1', until: Date.now() + H, msg: 'x' }, { uid: 'z', token: { firebase: { sign_in_provider: 'google.com' } } }));
        assert.deepStrictEqual(r, ['permission-denied', 'not_manager']);
    });
    test('조건 실패 → failed-precondition + 이유, 아무것도 안 쓴다', async () => {
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'c1', until: Date.now() - H, msg: 'x' })), ['failed-precondition', 'past']);
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'c1', until: Date.now() + 9 * D, msg: 'x' })), ['failed-precondition', 'too_far']);
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'c1', until: Date.now() + H, msg: 'open.kakao.com/o/1' })), ['failed-precondition', 'msg_link']);
        docs['clubs/c1'].is_verified = false;
        assert.deepStrictEqual(await reasonOf(post({ clubId: 'c1', until: Date.now() + H, msg: 'x' })), ['failed-precondition', 'unverified']);
        assert.strictEqual(docs['clubs/c1'].is_urgent, undefined);
        assert.strictEqual(logsOf('c1').length, 0);
    });
});

describe('sweepClubFlags', () => {
    const now = Date.now();
    const ts = (ms) => Timestamp.fromMillis(ms);
    test('일정·시간대', () => {
        assert.deepStrictEqual(fns.sweepClubFlags._opts, { schedule: 'every 60 minutes', timeZone: 'Asia/Seoul' });
    });
    test('끝난 급구 · 미인증 · 관리자 없음은 끄고, 기한 없는 급구엔 7일을 붙인다', async () => {
        const live = { name: 'live', is_verified: true, admins: ['m1'], is_urgent: true, urgent_msg: '센터', urgent_until: ts(now + H) };
        docs['clubs/c1'] = Object.assign({}, live);
        docs['clubs/exp'] = Object.assign({}, live, { urgent_until: ts(now - H), urgent_at: ts(now - 3 * H) });
        docs['clubs/unv'] = Object.assign({}, live, { is_verified: false });
        docs['clubs/orphan'] = Object.assign({}, live, { admins: [] });
        docs['clubs/legacy'] = Object.assign({}, live, { urgent_until: undefined });
        delete docs['clubs/legacy'].urgent_until;
        await fns.sweepClubFlags._handler();

        assert.strictEqual(docs['clubs/c1'].is_urgent, true);
        assert.strictEqual(logsOf('c1').length, 0);
        for (const [id, action] of [['exp', 'expire'], ['unv', 'unverified'], ['orphan', 'no_admin']]) {
            const c = docs['clubs/' + id];
            assert.strictEqual(c.is_urgent, false, id);
            assert.strictEqual(c.urgent_msg, '', id);
            assert.ok(!('urgent_until' in c) && !('urgent_at' in c), id + ' 기한·시각을 지운다');
            const logs = logsOf(id);
            assert.strictEqual(logs.length, 1, id);
            assert.strictEqual(logs[0].action, action);
            assert.strictEqual(logs[0].msg, '센터');
        }
        const lg = docs['clubs/legacy'];
        assert.strictEqual(lg.is_urgent, true);
        const until = lg.urgent_until.toMillis();
        assert.ok(until >= now + 7 * D && until < now + 7 * D + 60 * 1000);
        assert.strictEqual(logsOf('legacy')[0].action, 'migrate');
    });
    test('팀 문서 쓰기엔 읽은 시점 전제를 건다(그새 다시 올린 급구를 끄지 않게)', async () => {
        docs['clubs/exp'] = { is_verified: true, admins: ['m1'], is_urgent: true, urgent_msg: 'x', urgent_until: ts(now - H) };
        await fns.sweepClubFlags._handler();
        const upd = batchCommits.flat().filter((o) => o[0] === 'update');
        assert.strictEqual(upd.length, 1);
        assert.deepStrictEqual(upd[0][3], { lastUpdateTime: '<t:clubs/exp>' });
    });
    test('60일 넘은 모집은 끄고, recruit_at 없는 모집엔 지금 시각을 붙인다', async () => {
        docs['clubs/old'] = { is_recruiting: true, recruit_msg: 'a', recruit_at: ts(now - 61 * D), last_verified_at: ts(now - 70 * D) };
        docs['clubs/fresh'] = { is_recruiting: true, recruit_at: ts(now - 61 * D), last_verified_at: ts(now - D) };
        docs['clubs/nostamp'] = { is_recruiting: true };
        await fns.sweepClubFlags._handler();
        assert.strictEqual(docs['clubs/old'].is_recruiting, false);
        assert.strictEqual(docs['clubs/old'].recruit_msg, 'a');
        assert.strictEqual(docs['clubs/fresh'].is_recruiting, true);
        assert.strictEqual(docs['clubs/nostamp'].is_recruiting, true);
        assert.strictEqual(docs['clubs/nostamp'].recruit_at, TS);
        assert.strictEqual(logsOf('old').length, 0);
    });
    test('급구와 모집을 함께 고칠 팀은 팀 문서 쓰기 하나로 합친다', async () => {
        docs['clubs/both'] = { is_verified: true, admins: ['m1'], is_urgent: true, urgent_msg: 'x', urgent_until: ts(now - H),
            is_recruiting: true, recruit_at: ts(now - 90 * D) };
        await fns.sweepClubFlags._handler();
        const upd = batchCommits.flat().filter((o) => o[0] === 'update' && o[1] === 'clubs/both');
        assert.strictEqual(upd.length, 1);
        assert.strictEqual(docs['clubs/both'].is_urgent, false);
        assert.strictEqual(docs['clubs/both'].is_recruiting, false);
    });
    test('할 일이 없으면 쓰지 않는다', async () => {
        await fns.sweepClubFlags._handler();
        assert.strictEqual(batchCommits.length, 0);
    });
});
