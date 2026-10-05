// tests/urgent.test.js
// 급구 · 회원 모집 — 서버 순수 로직(functions/lib/pure.js)과 웹 계산(js/urgent.js · dom-utils.js).
// 두 쪽 문구 검사·급구 판정이 **같아야** 화면이 통과시킨 걸 서버가 거절하지 않는다.
// 실행: node --test tests/urgent.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pure = require('../functions/lib/pure');

// 웹 classic script 두 개를 같은 window 에 올린다(urgent.js 는 dom-utils 의 tsMillis 를 쓴다).
const sandbox = { window: {} };
vm.createContext(sandbox);
['dom-utils.js', 'urgent.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
});
const W = sandbox.window;

const H = 3600 * 1000;
const D = 24 * H;
const NOW = new Date(2026, 9, 5, 12, 0).getTime(); // 2026-10-05(월) 12:00 기기 시각
const ts = (ms) => ({ toMillis: () => ms });
// vm 안에서 만든 배열·객체는 다른 realm 이라 deepStrictEqual 이 같은 값도 다르다고 본다
const plain = (x) => JSON.parse(JSON.stringify(x));

describe('urgentMsgProblem — 서버·웹 같은 결과', () => {
    const cases = [
        ['', 'msg_empty'],
        ['   ', 'msg_empty'],
        [null, 'msg_empty'],
        [42, 'msg_empty'],
        ['센터 1명, 여자 레프트 1명', null],
        ['  센터 1명  ', null],
        ['가'.repeat(60), null],
        ['가'.repeat(61), 'msg_too_long'],
        ['🔥'.repeat(60), null],                // 코드 포인트로 센다 — UTF-16 으론 120
        ['🔥'.repeat(61), 'msg_too_long'],
        ['오픈채팅 https://x.y', 'msg_link'],
        ['www.example', 'msg_link'],
        ['open.kakao.com/o/abc', 'msg_link'],
        ['naver.com 으로', 'msg_link'],
        ['NULLOONGZI.KR', 'msg_link'],
        ['010-1234-5678 연락', 'msg_phone'],
        ['01012345678', 'msg_phone'],
        ['02 123 4567', 'msg_phone'],
        ['031.123.4567', 'msg_phone'],
        ['19:00~21:00 센터', null],
        ['20~30대 2명', null]
    ];
    cases.forEach(([msg, want]) => {
        test(JSON.stringify(msg) + ' → ' + want, () => {
            assert.strictEqual(pure.urgentMsgProblem(msg), want);
            assert.strictEqual(W.urgentMsgProblem(msg), want);
        });
    });
    test('모집 문구는 비워도 되고, 나머지 검사는 같다', () => {
        assert.strictEqual(W.recruitMsgProblem(''), null);
        assert.strictEqual(W.recruitMsgProblem('  '), null);
        assert.strictEqual(W.recruitMsgProblem('20대 여성'), null);
        assert.strictEqual(W.recruitMsgProblem('010-1234-5678'), 'msg_phone');
        assert.strictEqual(W.recruitMsgProblem('가'.repeat(61)), 'msg_too_long');
    });
    test('정규식이 글자 하나까지 같다', () => {
        const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
        const grab = (s, name) => {
            const m = s.match(new RegExp(name + '\\s*=\\s*(/.+/[a-z]*);'));
            assert.ok(m, name + ' 없음');
            return m[1];
        };
        const p = src('functions/lib/pure.js'), w = src('js/urgent.js');
        assert.strictEqual(grab(w, 'LINK_RE'), grab(p, 'URGENT_LINK_RE'));
        assert.strictEqual(grab(w, 'PHONE_RE'), grab(p, 'URGENT_PHONE_RE'));
    });
});

describe('toMillis — Timestamp · Date · ms', () => {
    test('세 가지 모양과 이상한 값', () => {
        assert.strictEqual(pure.toMillis(ts(5)), 5);
        assert.strictEqual(pure.toMillis(new Date(7)), 7);
        assert.strictEqual(pure.toMillis(9), 9);
        assert.strictEqual(pure.toMillis({ seconds: 2, nanoseconds: 5e6 }), 2005);
        assert.strictEqual(pure.toMillis(null), null);
        assert.strictEqual(pure.toMillis('2026-10-05'), null);
        assert.strictEqual(pure.toMillis(NaN), null);
        assert.strictEqual(W.tsMillis(ts(5)), 5);
        assert.strictEqual(W.tsMillis(9), 9);
        assert.strictEqual(W.tsMillis({ seconds: 2, nanoseconds: 5e6 }), 2005);
        assert.strictEqual(W.tsMillis('x'), null);
    });
});

describe('postUrgentBlockReason — 계약의 순서대로', () => {
    const club = { is_verified: true, admins: ['m1'] };
    const ok = { club, uid: 'm1', isOperator: false, untilMs: NOW + 3 * H, msg: '센터 1명', nowMs: NOW };
    const r = (over) => pure.postUrgentBlockReason(Object.assign({}, ok, over));

    test('정상', () => assert.strictEqual(r({}), null));
    test('관리자 아님 → not_manager (다른 문제보다 먼저)', () => {
        assert.strictEqual(r({ uid: 'x', club: { is_verified: false, admins: ['m1'] }, msg: '' }), 'not_manager');
    });
    test('운영자는 관리자가 아니어도 된다', () => assert.strictEqual(r({ uid: 'op', isOperator: true }), null));
    test('registered_by 폴백 관리자도 된다', () => {
        assert.strictEqual(r({ uid: 'o', club: { is_verified: true, registered_by: 'o' } }), null);
    });
    test('미인증 → unverified', () => {
        assert.strictEqual(r({ club: { is_verified: false, admins: ['m1'] } }), 'unverified');
        assert.strictEqual(r({ club: { admins: ['m1'] } }), 'unverified');
    });
    test('운영자가 막은 팀 → blocked (기한이 지나면 풀린다)', () => {
        const blocked = Object.assign({}, club, { urgent_blocked_until: ts(NOW + D) });
        assert.strictEqual(r({ club: blocked }), 'blocked');
        assert.strictEqual(r({ club: Object.assign({}, club, { urgent_blocked_until: ts(NOW - 1) }) }), null);
    });
    test('5분 안 → past, 8일 넘게 → too_far', () => {
        assert.strictEqual(r({ untilMs: NOW - H }), 'past');
        assert.strictEqual(r({ untilMs: NOW + 5 * 60 * 1000 }), 'past');
        assert.strictEqual(r({ untilMs: NOW + 5 * 60 * 1000 + 1 }), null);
        assert.strictEqual(r({ untilMs: NOW + 8 * D }), null);
        assert.strictEqual(r({ untilMs: NOW + 8 * D + 1 }), 'too_far');
        assert.strictEqual(r({ untilMs: NaN }), 'past');
    });
    test('문구는 마지막', () => {
        assert.strictEqual(r({ msg: ' ' }), 'msg_empty');
        assert.strictEqual(r({ msg: '010-1111-2222' }), 'msg_phone');
        assert.strictEqual(r({ untilMs: NOW - 1, msg: '' }), 'past');
    });
});

describe('isUrgentActive — 서버·웹 같은 판정', () => {
    const both = (club, want) => {
        assert.strictEqual(pure.isUrgentActive(club, NOW), want);
        assert.strictEqual(W.isUrgentActive(club, NOW), want);
    };
    test('기한 안 → 급구', () => both({ is_urgent: true, urgent_msg: '센터', urgent_until: ts(NOW + H) }, true));
    test('기한 지남 → 아님', () => {
        both({ is_urgent: true, urgent_msg: '센터', urgent_until: ts(NOW) }, false);
        both({ is_urgent: true, urgent_msg: '센터', urgent_until: NOW - 1 }, false);
    });
    test('기한 없는 예전 급구 → 급구', () => both({ is_urgent: true, urgent_msg: '센터' }, true));
    test('기한이 이상한 값이면 아님', () => both({ is_urgent: true, urgent_msg: '센터', urgent_until: 'soon' }, false));
    test('문구 없음 · true 아님 → 아님', () => {
        both({ is_urgent: true, urgent_msg: ' ', urgent_until: ts(NOW + H) }, false);
        both({ is_urgent: 'true', urgent_msg: '센터' }, false);
        both(null, false);
    });
    test('웹은 nowMs 를 안 주면 지금 시각', () => {
        assert.strictEqual(W.isUrgentActive({ is_urgent: true, urgent_msg: 'x', urgent_until: Date.now() + H }), true);
        assert.strictEqual(W.isUrgentActive({ is_urgent: true, urgent_msg: 'x', urgent_until: Date.now() - H }), false);
    });
});

describe('urgentSweepAction — 끄기가 기한 붙이기보다 먼저', () => {
    const base = { is_urgent: true, urgent_msg: '센터', is_verified: true, admins: ['m1'], urgent_until: ts(NOW + H) };
    const a = (over) => pure.urgentSweepAction(Object.assign({}, base, over), NOW);
    test('정상 → 할 일 없음', () => assert.strictEqual(a({}), null));
    test('꺼진 팀 → 없음', () => assert.strictEqual(a({ is_urgent: false }), null));
    test('기한 지남 → expire', () => assert.strictEqual(a({ urgent_until: ts(NOW) }), 'expire'));
    test('문구 없는 급구 → expire', () => assert.strictEqual(a({ urgent_msg: '' }), 'expire'));
    test('미인증 → unverified', () => assert.strictEqual(a({ is_verified: false }), 'unverified'));
    test('관리자 0명 → no_admin', () => {
        assert.strictEqual(a({ admins: [] }), 'no_admin');
        assert.strictEqual(a({ admins: undefined, registered_by: 'o' }), null);
    });
    test('기한 없음 → migrate', () => assert.strictEqual(a({ urgent_until: undefined }), 'migrate'));
    test('기한 없는데 꺼야 할 팀은 끈다', () => {
        assert.strictEqual(a({ urgent_until: undefined, is_verified: false }), 'unverified');
        assert.strictEqual(a({ urgent_until: undefined, admins: [] }), 'no_admin');
        assert.strictEqual(a({ urgent_until: undefined, urgent_msg: ' ' }), 'expire');
    });
    test('기한이 이상한 값 → migrate(기한을 새로 붙인다)', () => assert.strictEqual(a({ urgent_until: 'x' }), 'migrate'));
});

describe('recruitStale / recruitSweepAction — 60일', () => {
    const base = { is_recruiting: true, recruit_at: ts(NOW - 10 * D) };
    const s = (over) => pure.recruitStale(Object.assign({}, base, over), NOW);
    const a = (over) => pure.recruitSweepAction(Object.assign({}, base, over), NOW);
    test('60일 안 → 그대로', () => {
        assert.strictEqual(s({}), false);
        assert.strictEqual(s({ recruit_at: ts(NOW - 60 * D) }), false);
        assert.strictEqual(a({}), null);
    });
    test('60일 넘음 → off', () => {
        assert.strictEqual(s({ recruit_at: ts(NOW - 60 * D - 1) }), true);
        assert.strictEqual(a({ recruit_at: new Date(NOW - 61 * D) }), 'off');
        assert.strictEqual(a({ recruit_at: NOW - 61 * D }), 'off');
    });
    test('팀 정보를 고친 날(last_verified_at)이 더 늦으면 그날부터 센다', () => {
        assert.strictEqual(s({ recruit_at: ts(NOW - 90 * D), last_verified_at: ts(NOW - 5 * D) }), false);
        assert.strictEqual(s({ recruit_at: ts(NOW - 90 * D), last_verified_at: ts(NOW - 70 * D) }), true);
    });
    test('앞날짜가 박힌 값은 기준으로 안 쓴다', () => {
        assert.strictEqual(s({ recruit_at: ts(NOW - 90 * D), last_verified_at: ts(NOW + 400 * D) }), true);
        assert.strictEqual(a({ recruit_at: ts(NOW + 400 * D) }), 'stamp');
    });
    test('recruit_at 없음 → 낡았다고 보지 않고 지금 시각을 붙인다', () => {
        assert.strictEqual(s({ recruit_at: undefined, last_verified_at: ts(NOW - 300 * D) }), false);
        assert.strictEqual(a({ recruit_at: undefined }), 'stamp');
    });
    test('꺼진 팀 → 없음', () => {
        assert.strictEqual(s({ is_recruiting: false, recruit_at: ts(NOW - 300 * D) }), false);
        assert.strictEqual(a({ is_recruiting: 'true' }), null);
    });
});

describe('urgentNextSessions — 다가오는 운동 칩', () => {
    // 월 12:00 기준. 수 19:00~21:00 · 월 19:00~22:00 · 토 22:00~01:00(밤샘)
    const map = {
        '수': { startH: 19, startM: 0, endH: 21, endM: 0 },
        '월': { startH: 19, startM: 0, endH: 22, endM: 0 },
        '토': { startH: 22, startM: 0, endH: 1, endM: 0 }
    };
    const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).getTime();
    test('가장 이른 3개, 끝 시각 순', () => {
        const got = W.urgentNextSessions(map, NOW);
        assert.deepStrictEqual(plain(got.map((x) => [x.day, x.startMs, x.endMs])), [
            ['월', at(2026, 9, 5, 19, 0), at(2026, 9, 5, 22, 0)],
            ['수', at(2026, 9, 7, 19, 0), at(2026, 9, 7, 21, 0)],
            ['토', at(2026, 9, 10, 22, 0), at(2026, 9, 11, 1, 0)]
        ]);
    });
    test('끝나기 5분 안 남은 운동은 빠지고, 끝이 7일 안인 다음 주 운동만 들어온다', () => {
        // 21:56 — 오늘 운동은 4분 남았고, 다음 주 월요일은 7일 4분 뒤라 둘 다 빠진다
        assert.deepStrictEqual(plain(W.urgentNextSessions({ '월': map['월'] }, at(2026, 9, 5, 21, 56), 5)), []);
        const got = W.urgentNextSessions({ '월': map['월'] }, at(2026, 9, 5, 22, 1), 5);
        assert.deepStrictEqual(plain(got.map((x) => x.endMs)), [at(2026, 9, 12, 22, 0)]);
        const still = W.urgentNextSessions({ '월': map['월'] }, at(2026, 9, 5, 21, 54), 5);
        assert.deepStrictEqual(plain(still.map((x) => x.endMs)), [at(2026, 9, 5, 22, 0)]);
    });
    test('어제 밤 시작해 오늘 새벽 끝나는 운동', () => {
        // 일 00:30 — 토 22:00~01:00 이 아직 안 끝났다
        const got = W.urgentNextSessions({ '토': map['토'] }, at(2026, 9, 11, 0, 30), 3);
        assert.strictEqual(got[0].endMs, at(2026, 9, 11, 1, 0));
        assert.strictEqual(got[0].day, '토');
    });
    test('시간표가 없으면 빈 목록', () => {
        assert.deepStrictEqual(plain(W.urgentNextSessions({}, NOW)), []);
        assert.deepStrictEqual(plain(W.urgentNextSessions(null, NOW)), []);
    });
    test('칩 글자 — 한/영', () => {
        const s = { startMs: at(2026, 9, 7, 19, 0), endMs: at(2026, 9, 7, 21, 0) };
        assert.strictEqual(W.urgentSessionLabel(s, 'ko'), '수 10/7 19:00~21:00');
        const en = { '수': 'Wed' };
        assert.strictEqual(W.urgentSessionLabel(s, 'en', (k) => en[k]), 'Wed 10/7 19:00–21:00');
    });
    test('다른 날 → ms', () => {
        assert.strictEqual(W.urgentOtherDayUntil('2026-10-08', '21:30'), at(2026, 9, 8, 21, 30));
        assert.strictEqual(W.urgentOtherDayUntil('', '21:30'), null);
        assert.strictEqual(W.urgentOtherDayUntil('2026-10-08', ''), null);
        assert.strictEqual(W.urgentDateInputValue(at(2026, 0, 3, 5, 0)), '2026-01-03');
    });
});

describe('urgentDeadlineParts / Label — 마감 표시', () => {
    const at = (d, h, mi) => new Date(2026, 9, d, h, mi).getTime();
    test('오늘 · 내일 · D-n', () => {
        assert.deepStrictEqual(plain(W.urgentDeadlineParts(at(5, 21, 0), NOW)),
            { key: 'ug_until_today', params: { time: '21:00', n: 0, dow: 1 } });
        assert.strictEqual(W.urgentDeadlineParts(at(6, 0, 30), NOW).key, 'ug_until_tomorrow');
        assert.strictEqual(W.urgentDeadlineParts(at(6, 0, 30), NOW).params.time, '00:30');
        const d3 = W.urgentDeadlineParts(at(8, 9, 5), NOW);
        assert.strictEqual(d3.key, 'ug_until_day');
        assert.strictEqual(d3.params.n, 3);
        assert.strictEqual(d3.params.dow, 4);
        assert.strictEqual(d3.params.time, '09:05');
    });
    test('밤 11시에 본 다음 날 새벽 마감은 내일(24시간 단위가 아니라 날짜로 센다)', () => {
        assert.strictEqual(W.urgentDeadlineParts(at(6, 1, 0), at(5, 23, 0)).key, 'ug_until_tomorrow');
    });
    test('기한 없음 · 지남 → null', () => {
        assert.strictEqual(W.urgentDeadlineParts(null, NOW), null);
        assert.strictEqual(W.urgentDeadlineParts(NOW, NOW), null);
    });
    test('라벨 — tf 로 채운다, 예전 급구는 빈 글자', () => {
        W.tf = (k, p) => k + '|' + p.time + '|' + p.n + '|' + p.day;
        W.i18nDay = (k) => k;
        assert.strictEqual(W.urgentDeadlineLabel({ urgent_until: ts(at(8, 21, 0)) }, NOW), 'ug_until_day|21:00|3|목');
        assert.strictEqual(W.urgentDeadlineLabel({}, NOW), '');
        delete W.tf; delete W.i18nDay;
    });
});
