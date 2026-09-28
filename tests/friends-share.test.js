// tests/friends-share.test.js — 밥친구 2단계 순수 규칙 (js/friends-share.js window.friendSharePure).
// 핵심 불변식: 숨긴 팀은 친구용 사본에 아예 들어가지 않는다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'friends-share.js'), 'utf-8'), sandbox);
const P = sandbox.window.friendSharePure;
const J = (v) => JSON.parse(JSON.stringify(v));

describe('친구용 도시락 사본', () => {
    const bookmarks = ['club-a', null, 'custom_1', 'club-b', 'custom_2'];
    const custom = {
        custom_1: { name: '회사팀', schedule: '수 19:00-21:00' },
        custom_2: { name: '동네 모임', schedule: '일 10:00-12:00' }
    };

    test('칸 순서대로, 빈칸은 빼고, 직접 추가한 팀은 이름·일정만', () => {
        assert.deepStrictEqual(J(P.buildSharedLunchbox(bookmarks, custom, [], false)), {
            teams: ['club-a', 'club-b'],
            custom: [{ name: '회사팀', schedule: '수 19:00-21:00' }, { name: '동네 모임', schedule: '일 10:00-12:00' }],
            hide_all: false
        });
    });
    test('숨긴 팀은 사본에 들어가지 않는다 (동호회·직접 추가 둘 다)', () => {
        const r = J(P.buildSharedLunchbox(bookmarks, custom, ['club-b', 'custom_1'], false));
        assert.deepStrictEqual(r.teams, ['club-a']);
        assert.deepStrictEqual(r.custom.map(c => c.name), ['동네 모임']);
        assert.ok(!JSON.stringify(r).includes('회사팀'));
    });
    test('전부 숨기기면 아무 팀도 나가지 않는다', () => {
        assert.deepStrictEqual(J(P.buildSharedLunchbox(bookmarks, custom, [], true)), { teams: [], custom: [], hide_all: true });
    });
    test('5칸을 넘거나 이상한 입력에도 룰 모양(최대 5)을 지킨다', () => {
        const r = P.buildSharedLunchbox(['a', 'b', 'c', 'd', 'e', 'f', 'g'], null, null, false);
        assert.strictEqual(r.teams.length, 5);
        assert.deepStrictEqual(J(P.buildSharedLunchbox(null, null, null, false)), { teams: [], custom: [], hide_all: false });
    });
    test('같은 내용이면 같다고 본다 (다시 쓰지 않음 → 도시락 바뀜이 헛돌지 않게)', () => {
        const a = P.buildSharedLunchbox(bookmarks, custom, [], false);
        const b = P.buildSharedLunchbox(bookmarks.slice(), JSON.parse(JSON.stringify(custom)), [], false);
        assert.strictEqual(P.sharedEqual(a, b), true);
        assert.strictEqual(P.sharedEqual(a, P.buildSharedLunchbox(bookmarks, custom, ['club-a'], false)), false);
        assert.strictEqual(P.sharedEqual(a, null), false);
    });
});

describe('식단표 이벤트', () => {
    test('팀 목록 → 요일·시각 이벤트, 칸 번호 유지', () => {
        const parse = (t) => t === '토 19:00-22:00' ? { 토: { startH: 19, startM: 0, endH: 22, endM: 0 } } : {};
        const ev = J(P.scheduleEvents([{ name: 'A', schedule: '토 19:00-22:00', slot: 3 }, { name: 'B', schedule: '' }], parse));
        assert.deepStrictEqual(ev, [{ day: '토', start: 19, end: 22, name: 'A', slot: 3 }]);
    });
});
