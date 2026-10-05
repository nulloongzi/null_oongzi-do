// tests/this-week.test.js
// 🍚 여기 자리 있어요? 항목 만들기(js/this-week.js) — 게스트 급구 · 🥄 맛보기 · 픽업,
// 겹치는 회차 빼기, 시간순, 7일 창, 팀당 3개, 날짜 묶음·칩, 연락 출처 flag.
// 실행: node --test tests/this-week.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
['dom-utils.js', 'urgent.js', 'this-week.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
});
const W = sandbox.window;

const H = 3600 * 1000;
const D = 24 * H;
const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi || 0).getTime();
const NOW = at(2026, 9, 5, 12, 0); // 2026-10-05(월) 12:00 기기 시각
const ts = (ms) => ({ toMillis: () => ms });
const plain = (x) => JSON.parse(JSON.stringify(x));

// parseScheduleText 대역: "수 19:00~21:00, 토 10:00~12:00" 정도만 읽는다(진짜는 schedule-parse.test.js)
function parseText(text) {
    const map = {};
    String(text).split(/[,/]/).forEach((seg) => {
        const m = /([월화수목금토일]+)\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/.exec(seg);
        if (!m) return;
        for (const d of m[1]) map[d] = { startH: +m[2], startM: +m[3], endH: +m[4], endM: +m[5] };
    });
    return map;
}
const build = (input, now) => W.thisWeekItems(Object.assign({ parseText }, input), now == null ? NOW : now);
const brief = (items) => plain(items.map((it) => [it.kind, it.refId, it.start, it.end]));

describe('게스트 급구(guest)', () => {
    test('끝 = urgent_until, 시작 = 끝이 같은 회차', () => {
        const club = {
            id: 'c1', name: '수요팀', address: '서울 성북구 안암로 1', schedule: '수 19:00~21:00',
            is_urgent: true, urgent_msg: ' 센터 1명 ', urgent_until: ts(at(2026, 9, 7, 21, 0))
        };
        const items = build({ clubs: [club] });
        assert.deepStrictEqual(plain(items), [{
            kind: 'guest', start: at(2026, 9, 7, 19, 0), end: at(2026, 9, 7, 21, 0),
            title: '수요팀', place: '서울 성북구', msg: '센터 1명', refId: 'c1', refType: 'club'
        }]);
    });
    test('맞는 회차가 없으면 start = null ("~HH:mm")', () => {
        const club = { id: 'c2', name: 'x', schedule: '수 19:00~21:00', is_urgent: true, urgent_msg: 'm', urgent_until: ts(at(2026, 9, 8, 22, 0)) };
        const [it] = build({ clubs: [club] });
        assert.strictEqual(it.start, null);
        assert.strictEqual(it.end, at(2026, 9, 8, 22, 0));
    });
    test('기한 없는 예전 급구·지난 급구·문구 없는 급구는 뺀다', () => {
        const clubs = [
            { id: 'legacy', name: 'a', is_urgent: true, urgent_msg: 'm' },
            { id: 'past', name: 'b', is_urgent: true, urgent_msg: 'm', urgent_until: ts(NOW - 1) },
            { id: 'blank', name: 'c', is_urgent: true, urgent_msg: '  ', urgent_until: ts(NOW + H) }
        ];
        assert.strictEqual(build({ clubs }).length, 0);
    });
});

describe('🥄 맛보기(drop_in)', () => {
    const base = { id: 'r1', name: '모집팀', address: '경기 수원시', schedule: '월 19:00~22:00, 수 19:00~21:00, 토 10:00~12:00', is_recruiting: true, recruit_drop_in: true, recruit_msg: '초보 환영' };
    test('모집 + 맛보기일 때만, 7일 안 회차 3개까지', () => {
        const items = build({ clubs: [base] });
        assert.deepStrictEqual(brief(items), [
            ['drop_in', 'r1', at(2026, 9, 5, 19, 0), at(2026, 9, 5, 22, 0)],
            ['drop_in', 'r1', at(2026, 9, 7, 19, 0), at(2026, 9, 7, 21, 0)],
            ['drop_in', 'r1', at(2026, 9, 10, 10, 0), at(2026, 9, 10, 12, 0)]
        ]);
        assert.strictEqual(items[0].msg, '초보 환영');
        assert.strictEqual(items[0].place, '경기 수원시');
    });
    test('맛보기를 안 켰거나 모집이 꺼졌으면 없다', () => {
        assert.strictEqual(build({ clubs: [Object.assign({}, base, { recruit_drop_in: false })] }).length, 0);
        assert.strictEqual(build({ clubs: [Object.assign({}, base, { is_recruiting: false })] }).length, 0);
        assert.strictEqual(build({ clubs: [Object.assign({}, base, { recruit_drop_in: 'true' })] }).length, 0);
    });
    test('끝이 5분도 안 남은 회차는 빠진다(다음 주 회차는 7일 창 밖)', () => {
        const club = Object.assign({}, base, { schedule: '월 19:00~22:00' });
        // 21:56 → 오늘 22:00 은 5분 안, 다음 주 월 22:00 은 now+7일(21:56) 뒤
        assert.strictEqual(build({ clubs: [club] }, at(2026, 9, 5, 21, 56)).length, 0);
        const still = build({ clubs: [club] }, at(2026, 9, 5, 21, 54));
        assert.deepStrictEqual(brief(still), [['drop_in', 'r1', at(2026, 9, 5, 19, 0), at(2026, 9, 5, 22, 0)]]);
    });
    test('schedule_raw 가 있으면 그걸 쓴다(같은 날 두 번도)', () => {
        const club = Object.assign({}, base, {
            schedule: '금 07:00~08:00',
            schedule_raw: [{ day: '화', start: '10:00', end: '12:00' }, { day: '화', start: '19:00', end: '21:00' }, { day: '없음', start: '1:00', end: '2:00' }]
        });
        assert.deepStrictEqual(brief(build({ clubs: [club] })), [
            ['drop_in', 'r1', at(2026, 9, 6, 10, 0), at(2026, 9, 6, 12, 0)],
            ['drop_in', 'r1', at(2026, 9, 6, 19, 0), at(2026, 9, 6, 21, 0)]
        ]);
    });
    test('일정을 못 읽으면 항목이 없다', () => {
        assert.strictEqual(build({ clubs: [Object.assign({}, base, { schedule: '매주 협의' })] }).length, 0);
    });
    test('게스트 급구와 같은 회차(같은 끝)는 맛보기에서 빼고 급구만 남긴다', () => {
        const club = Object.assign({}, base, { is_urgent: true, urgent_msg: '레프트', urgent_until: ts(at(2026, 9, 7, 21, 0)) });
        assert.deepStrictEqual(brief(build({ clubs: [club] })), [
            ['drop_in', 'r1', at(2026, 9, 5, 19, 0), at(2026, 9, 5, 22, 0)],
            ['guest', 'r1', at(2026, 9, 7, 19, 0), at(2026, 9, 7, 21, 0)],
            ['drop_in', 'r1', at(2026, 9, 10, 10, 0), at(2026, 9, 10, 12, 0)]
        ]);
    });
});

describe('픽업(pickup)', () => {
    const spot = { id: 'p1', title: '한강 픽업', venue_name: '뚝섬 체육관', region: '서울', schedule: '토 19:00~22:00', this_week: ' 이번 주는 2코트 ' };
    test('만료 안 된 스팟의 회차, 이번 주 메모가 msg', () => {
        assert.deepStrictEqual(plain(build({ pickups: [spot] })), [{
            kind: 'pickup', start: at(2026, 9, 10, 19, 0), end: at(2026, 9, 10, 22, 0),
            title: '한강 픽업', place: '뚝섬 체육관', msg: '이번 주는 2코트', refId: 'p1', refType: 'pickup'
        }]);
    });
    test('공개 정보로 대신 올린 크루(curated)는 넣지 않는다 · 직접 올린 크루(self·없음)는 넣는다', () => {
        assert.strictEqual(build({ pickups: [Object.assign({}, spot, { source: 'curated' })] }).length, 0);
        assert.strictEqual(build({ pickups: [Object.assign({}, spot, { source: 'self' })] }).length, 1);
        assert.strictEqual(build({ pickups: [spot] }).length, 1);
    });
    test('만료됐으면 뺀다 · expire_at 이 없거나 뒤면 남긴다', () => {
        assert.strictEqual(build({ pickups: [Object.assign({}, spot, { expire_at: ts(NOW - 1) })] }).length, 0);
        assert.strictEqual(build({ pickups: [Object.assign({}, spot, { expire_at: ts(NOW + D) })] }).length, 1);
        assert.strictEqual(build({ pickups: [Object.assign({}, spot, { expire_at: null })] }).length, 1);
    });
    test('크루당 3개까지 · 장소는 체육관 → 지역 → 주소 앞 두 낱말', () => {
        const daily = { id: 'p2', title: '매일', address: '부산 해운대구 우동', schedule_raw: '월화수목금토일'.split('').map((d) => ({ day: d, start: '06:00', end: '07:00' })) };
        const items = build({ pickups: [daily] });
        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[0].place, '부산 해운대구');
        assert.strictEqual(items[0].start, at(2026, 9, 6, 6, 0));
        assert.strictEqual(build({ pickups: [{ id: 'p3', title: 't', region: '경기', schedule: '토 1:00~2:00' }] })[0].place, '경기');
    });
    test('schedule 이 없으면 schedule_text 를 읽는다', () => {
        const items = build({ pickups: [{ id: 'p4', title: 't', schedule: '', schedule_text: '수 20:00~22:00' }] });
        assert.deepStrictEqual(brief(items), [['pickup', 'p4', at(2026, 9, 7, 20, 0), at(2026, 9, 7, 22, 0)]]);
    });
});

describe('정렬 · 창 · 묶음', () => {
    test('(start ?? end) 오름차순, 같으면 급구 → 맛보기 → 픽업', () => {
        const clubs = [
            { id: 'g', name: 'g', is_urgent: true, urgent_msg: 'm', urgent_until: ts(at(2026, 9, 6, 19, 0)) }, // start 없음 → 19:00 로 정렬
            { id: 'd', name: 'd', schedule: '화 19:00~21:00', is_recruiting: true, recruit_drop_in: true }
        ];
        const pickups = [{ id: 'p', title: 'p', schedule: '화 19:00~21:00' }, { id: 'q', title: 'q', schedule: '월 13:00~15:00' }];
        assert.deepStrictEqual(plain(build({ clubs, pickups }).map((it) => it.refId)), ['q', 'g', 'd', 'p']);
    });
    test('밤샘 회차(22:00~01:00)는 다음 날 끝난다', () => {
        const items = build({ pickups: [{ id: 'n', title: 'n', schedule: '토 22:00~01:00' }] });
        assert.deepStrictEqual(brief(items), [['pickup', 'n', at(2026, 9, 10, 22, 0), at(2026, 9, 11, 1, 0)]]);
    });
    test('7일을 넘는 회차는 없다', () => {
        const items = build({ pickups: [{ id: 'm', title: 'm', schedule: '월 10:00~11:00' }] });
        // 오늘(월) 10~11시는 지났고, 다음 주 월 11:00 은 now+7일(12:00) 안 → 1개
        assert.deepStrictEqual(brief(items), [['pickup', 'm', at(2026, 9, 12, 10, 0), at(2026, 9, 12, 11, 0)]]);
        const late = build({ pickups: [{ id: 'm2', title: 'm', schedule: '월 19:00~22:00' }] });
        assert.deepStrictEqual(brief(late), [['pickup', 'm2', at(2026, 9, 5, 19, 0), at(2026, 9, 5, 22, 0)]]);
    });
    test('곳 수는 팀·크루 단위', () => {
        const items = build({
            clubs: [{ id: 'same', name: 'c', schedule: '화 19:00~21:00, 목 19:00~21:00', is_recruiting: true, recruit_drop_in: true }],
            pickups: [{ id: 'same', title: 'p', schedule: '화 19:00~21:00' }]
        });
        assert.strictEqual(items.length, 3);
        assert.strictEqual(W.twPlaceCount(items), 2);
        assert.strictEqual(W.twPlaceCount([]), 0);
    });
    test('칩 거르기 · 날짜 묶음 · 날짜 칩', () => {
        const items = build({
            clubs: [{ id: 'g', name: 'g', is_urgent: true, urgent_msg: 'm', urgent_until: ts(at(2026, 9, 6, 21, 0)) }],
            pickups: [{ id: 'p', title: 'p', schedule: '화 19:00~21:00, 금 19:00~21:00' }]
        });
        const tue = at(2026, 9, 6, 0, 0);
        assert.deepStrictEqual(plain(W.twFilterItems(items, { guest: false, drop_in: true, pickup: true }, null).map((x) => x.kind)), ['pickup', 'pickup']);
        assert.deepStrictEqual(plain(W.twFilterItems(items, null, tue).map((x) => x.refId)), ['p', 'g']);
        const groups = W.twGroupByDay(items);
        assert.deepStrictEqual(plain(groups.map((g) => [g.day, g.items.length])), [[tue, 2], [at(2026, 9, 9, 0, 0), 1]]);
        const chips = W.twDayChips(items, NOW);
        assert.strictEqual(chips.length, 7);
        assert.strictEqual(chips[0], at(2026, 9, 5, 0, 0));
        assert.strictEqual(chips[6], at(2026, 9, 11, 0, 0));
        // 7일째 뒤(다음 주 월) 새벽까지 있으면 그날 칩이 붙는다
        const late = build({ pickups: [{ id: 'x', title: 'x', schedule: '월 06:00~08:00' }] });
        assert.strictEqual(W.twDayChips(late, NOW).length, 8);
    });
});

describe('contactFlag — 누른 순간 팀 상태', () => {
    test('guest > drop_in > recruit > none', () => {
        const until = ts(NOW + H);
        assert.strictEqual(W.contactFlag({ is_urgent: true, urgent_msg: 'm', urgent_until: until, is_recruiting: true, recruit_drop_in: true }, NOW), 'guest');
        assert.strictEqual(W.contactFlag({ is_recruiting: true, recruit_drop_in: true }, NOW), 'drop_in');
        assert.strictEqual(W.contactFlag({ is_recruiting: true }, NOW), 'recruit');
        assert.strictEqual(W.contactFlag({ is_recruiting: false, recruit_drop_in: true }, NOW), 'none');
        assert.strictEqual(W.contactFlag({ is_urgent: true, urgent_msg: 'm', urgent_until: ts(NOW - 1) }, NOW), 'none');
        assert.strictEqual(W.contactFlag(null), 'none');
    });
});

describe('clubFlagMarks — 지도 라벨 앞 표시', () => {
    test('🔥 먼저, 그다음 🍚 · 🥄', () => {
        const until = ts(NOW + H);
        assert.strictEqual(W.clubFlagMarks({ is_urgent: true, urgent_msg: 'm', urgent_until: until, is_recruiting: true, recruit_drop_in: true }, NOW), '🔥🍚🥄');
        assert.strictEqual(W.clubFlagMarks({ is_recruiting: true }, NOW), '🍚');
        assert.strictEqual(W.clubFlagMarks({ is_recruiting: false, recruit_drop_in: true }, NOW), '');
        assert.strictEqual(W.clubFlagMarks({ is_urgent: true, urgent_msg: 'm', urgent_until: until }, NOW), '🔥');
    });
});
