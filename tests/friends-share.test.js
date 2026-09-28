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
    test('옛 숫자 id 도 문자열 숨김 목록과 맞춘다', () => {
        const out = P.buildSharedLunchbox([123, 'b'], {}, ['123'], false);
        assert.deepEqual(out.teams, ['b']);
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

describe('겸상 · 익힘 (3단계)', () => {
    const ev = (day, start, end) => ({ day, start, end });
    test('같은 팀 · 같은 요일 · 30분 이상 겹치면 겸상', () => {
        const mine = [{ id: 'a', events: [ev('월', 19, 22), ev('수', 20, 22)] }];
        const theirs = [{ id: 'a', events: [ev('월', 19, 22), ev('수', 21.75, 23)] }];
        const ov = P.mealOverlaps(mine, theirs);
        assert.equal(ov.length, 1);   // 수요일은 15분만 겹쳐 빠진다
        assert.deepEqual({ ...ov[0] }, { id: 'a', day: '월', start: 19, end: 22 });
    });
    test('다른 팀이면 같은 시간이어도 겸상이 아니다', () => {
        const ov = P.mealOverlaps([{ id: 'a', events: [ev('월', 19, 22)] }], [{ id: 'b', events: [ev('월', 19, 22)] }]);
        assert.equal(ov.length, 0);
    });
    test('id 없는 팀(직접 추가)은 세지 않는다', () => {
        const ov = P.mealOverlaps([{ id: '', events: [ev('월', 19, 22)] }], [{ id: '', events: [ev('월', 19, 22)] }]);
        assert.equal(ov.length, 0);
    });
    test('겹치는 시간만 잘라 한 번씩 센다 (중복 없음)', () => {
        const mine = [{ id: 'a', events: [ev('토', 14, 17)] }, { id: 'a', events: [ev('토', 14, 17)] }];
        const theirs = [{ id: 'a', events: [ev('토', 15, 18)] }];
        const ov = P.mealOverlaps(mine, theirs);
        assert.equal(ov.length, 1);
        assert.equal(ov[0].start, 15);
        assert.equal(ov[0].end, 17);
    });
    test('양쪽이 대칭이다 (나 → 친구, 친구 → 나 같은 횟수)', () => {
        const x = [{ id: 'a', events: [ev('월', 19, 22)] }, { id: 'b', events: [ev('금', 20, 22)] }];
        const y = [{ id: 'a', events: [ev('월', 20, 23)] }, { id: 'b', events: [ev('금', 18, 21)] }];
        assert.equal(P.mealOverlaps(x, y).length, P.mealOverlaps(y, x).length);
    });
    test('익힘 단계: 0 생쌀 · 1 뜸 · 2 노릇 · 3회 이상 누룽지', () => {
        assert.deepEqual([0, 1, 2, 3, 4, 9].map(P.warmthTier), [0, 1, 2, 3, 3, 3]);
    });
});

describe('포장하기 밥친구 · 겸상 목록 (4단계)', () => {
    test('pickCardFriends: 겸상 있는 친구만, 전부 숨긴 친구 제외, 겸상 많은 순 최대 4', () => {
        const out = P.pickCardFriends([
            { name: '가', n: 1, tier: 1 }, { name: '나', n: 0, tier: 0 }, { name: '다', n: 3, tier: 3 },
            { name: '라', n: 2, tier: 2, hidden: true }, { name: '마', n: 2, tier: 2 }, { name: '바', n: 1, tier: 1 }, { name: '사', n: 1, tier: 1 }
        ]);
        assert.deepEqual(out.map((f) => f.name), ['다', '마', '가', '바']);
        assert.deepEqual(P.pickCardFriends([], 4), []);
        assert.deepEqual(P.pickCardFriends(null), []);
    });
    test('sortOverlaps: 요일 → 시작 시각', () => {
        const out = P.sortOverlaps([{ day: '토', start: 19, end: 22 }, { day: '월', start: 20, end: 22 }, { day: '월', start: 19, end: 21 }]);
        assert.deepEqual(out.map((o) => o.day + o.start), ['월19', '월20', '토19']);
    });
    test('fmtRange: 정시는 시만, 아니면 분까지', () => {
        assert.equal(P.fmtRange(19, 22), '19–22');
        assert.equal(P.fmtRange(19.5, 22), '19:30–22');
        assert.equal(P.fmtRange(9.25, 10.75), '9:15–10:45');
    });
});
