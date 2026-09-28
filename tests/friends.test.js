// tests/friends.test.js — 밥친구 순수 규칙 (js/friends.js window.friendsPure).
// 실행: node --test tests/friends.test.js
// 코드 형식은 firestore.rules invite_codes 의 정규식과, pairId 는 friendships 문서 id 규칙과 같아야 한다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'friends.js'), 'utf-8');
const noop = () => { };
const sandbox = {
    window: { addEventListener: noop },
    document: { readyState: 'complete', getElementById: () => null, addEventListener: noop },
    localStorage: { getItem: () => null, setItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { search: '', href: 'https://do.nulloongzi.com/' },
    requestAnimationFrame: noop, setTimeout, clearTimeout, URL, URLSearchParams
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const P = sandbox.window.friendsPure;
const RULE_RE = /^[A-HJ-NP-Z2-9]{6}$/;   // firestore.rules 와 같은 식

describe('초대코드', () => {
    test('알파벳 32자, 헷갈리는 0·O·1·I 없음', () => {
        assert.strictEqual(P.CODE_ALPHABET.length, 32);
        for (const ch of '0O1I') assert.ok(!P.CODE_ALPHABET.includes(ch), ch);
    });
    test('만든 코드는 항상 룰 정규식을 통과한다', () => {
        for (let i = 0; i < 500; i++) assert.match(P.makeInviteCode(), RULE_RE);
        // 난수 경계값
        assert.strictEqual(P.makeInviteCode(() => 0), 'AAAAAA');
        assert.strictEqual(P.makeInviteCode((n) => n - 1), '999999');
    });
    test('사람이 친 코드 정규화: 소문자·공백·하이픈 허용, 형식 밖은 빈 값', () => {
        assert.strictEqual(P.normalizeCode(' nrj-7k2 '), 'NRJ7K2');
        assert.strictEqual(P.normalizeCode('NRJ 7K2'), 'NRJ7K2');
        assert.strictEqual(P.normalizeCode('NRJ7K0'), '');   // 0 은 우리 알파벳에 없다
        assert.strictEqual(P.normalizeCode('NRJ7K'), '');
        assert.strictEqual(P.normalizeCode(null), '');
    });
});

describe('관계', () => {
    test('pairId: 순서와 상관없이 같은 문서', () => {
        assert.strictEqual(P.pairId('b', 'a'), 'a_b');
        assert.strictEqual(P.pairId('a', 'b'), 'a_b');
    });

    const now = Date.parse('2026-09-28T00:00:00Z');
    const day = 24 * 3600 * 1000;
    const at = (ms) => ({ toMillis: () => ms });
    const doc = (id, d) => ({ id, data: d });

    test('신청은 7일 뒤 만료, 서버 시각이 아직 없는 막 만든 신청은 만료 아님', () => {
        assert.strictEqual(P.isExpired({ status: 'pending', created_at: at(now - 8 * day) }, now), true);
        assert.strictEqual(P.isExpired({ status: 'pending', created_at: at(now - 6 * day) }, now), false);
        assert.strictEqual(P.isExpired({ status: 'pending', created_at: null }, now), false);
        assert.strictEqual(P.isExpired({ status: 'accepted', created_at: at(0) }, now), false);
    });

    test('partition: 친구 / 받은 신청 / 보낸 신청, 만료된 신청은 뺀다', () => {
        const me = 'me';
        const r = P.partition([
            doc('a_me', { members: ['a', 'me'], status: 'accepted', requested_by: 'a', requested_to: 'me' }),
            doc('b_me', { members: ['b', 'me'], status: 'pending', requested_by: 'b', requested_to: 'me', created_at: at(now - day) }),
            doc('c_me', { members: ['c', 'me'], status: 'pending', requested_by: 'me', requested_to: 'c', created_at: at(now) }),
            doc('d_me', { members: ['d', 'me'], status: 'pending', requested_by: 'd', requested_to: 'me', created_at: at(now - 30 * day) })
        ], me, now);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(r.friends.map(x => x.other))), ['a']);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(r.incoming.map(x => x.other))), ['b']);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(r.outgoing.map(x => x.other))), ['c']);
    });
});
