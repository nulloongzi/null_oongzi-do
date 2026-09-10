// tests/schedule-parse.test.js
// window.parseScheduleText — 상세 시간표·식단표·포장하기 카드가 모두 이걸 쓴다.
//
// 2026-09-10: 수 19:00~21:30 / 일 14:00~18:00 인 팀의 상세 시간표에서 **일요일이
// 수요일 시간으로** 떴다. 저장은 ', ' 로 잇는데(registration.js getScheduleData)
// 읽기는 '/' 로만 잘라서, 통째로 한 덩어리가 된 뒤 첫 시간 하나만 읽고 그 안의
// 모든 요일에 같은 시간을 붙였기 때문이다.
//
// club-detail.js 는 window.* 에 붙는 classic script — vm 으로 실행해 캡처한다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// club-detail.js 는 최상단에서 DOM 을 만진다(버튼 핸들러 등록 등).
// 파싱 함수 하나 때문에 파일을 통째로 못 읽으면 곤란하니, 무엇을 해도
// 조용히 받아주는 元素 스텁을 준다 — 우리가 보는 건 window.parseScheduleText 뿐이다.
function stubEl() {
    const el = {
        style: {}, dataset: {}, value: '', innerHTML: '', textContent: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {}, removeEventListener() {},
        appendChild() {}, removeChild() {}, remove() {}, setAttribute() {},
        getAttribute: () => null, closest: () => null, focus() {}, click() {},
        querySelector: () => stubEl(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    };
    return el;
}
const sandbox = {
    window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), location: { href: '', search: '' } },
    document: {
        getElementById: () => stubEl(),
        querySelector: () => stubEl(),
        querySelectorAll: () => [],
        createElement: () => stubEl(),
        addEventListener() {},
        body: stubEl(),
    },
    kakao: undefined,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'club-detail.js'), 'utf-8'),
    sandbox
);
const parse = sandbox.window.parseScheduleText;

const hhmm = (d) => d && `${d.startH}:${String(d.startM).padStart(2, '0')}` +
    `~${d.endH}:${String(d.endM).padStart(2, '0')}`;

describe('parseScheduleText', () => {
    // 실제로 깨졌던 데이터. 저장 포맷(', ')이 그대로 들어온다.
    test('쉼표로 이어진 두 블록이 각자의 시간을 갖는다 (회귀)', () => {
        const r = parse('수 19:00~21:30, 일 14:00~18:00');
        assert.strictEqual(hhmm(r['수']), '19:00~21:30');
        assert.strictEqual(hhmm(r['일']), '14:00~18:00', '일요일이 수요일 시간을 물려받았다');
        assert.strictEqual(Object.keys(r).length, 2);
    });

    test('표시 문자열도 각자 12시간제로', () => {
        const r = parse('수 19:00~21:30, 일 14:00~18:00');
        assert.strictEqual(r['수'].text, 'PM 7:00~PM 9:30');
        assert.strictEqual(r['일'].text, 'PM 2:00~PM 6:00');
    });

    // 이걸 지키려고 '쉼표로도 split' 이라는 쉬운 수정을 쓸 수 없었다.
    test('요일을 쉼표로 나열한 예전 표기는 한 시간대를 공유한다', () => {
        const r = parse('월, 수, 금 19:00~22:00');
        assert.deepStrictEqual(Object.keys(r).sort(), ['금', '수', '월']);
        ['월', '수', '금'].forEach((d) =>
            assert.strictEqual(hhmm(r[d]), '19:00~22:00', d));
    });

    test("예전 '/' 구분자도 그대로 동작한다", () => {
        const r = parse('수 19:00~21:30 / 일 14:00~18:00');
        assert.strictEqual(hhmm(r['수']), '19:00~21:30');
        assert.strictEqual(hhmm(r['일']), '14:00~18:00');
    });

    test("'/' 와 쉼표가 섞여도 각자 산다", () => {
        const r = parse('월 10:00~12:00 / 수 19:00~21:30, 일 14:00~18:00');
        assert.strictEqual(hhmm(r['월']), '10:00~12:00');
        assert.strictEqual(hhmm(r['수']), '19:00~21:30');
        assert.strictEqual(hhmm(r['일']), '14:00~18:00');
    });

    // 시간이 하나뿐인 덩어리는 덩어리 전체에서 요일을 찾는다 — 요일이 시간
    // 뒤에 오는 예전 표기를 살리기 위해서다.
    test('요일이 시간 뒤에 와도 잡는다', () => {
        const r = parse('19:00~22:00 월수금');
        assert.deepStrictEqual(Object.keys(r).sort(), ['금', '수', '월']);
    });

    test('오전·자정 경계 표기', () => {
        const r = parse('토 06:00~08:30, 일 00:00~12:00');
        assert.strictEqual(r['토'].text, 'AM 6:00~AM 8:30');
        assert.strictEqual(r['일'].text, 'AM 12:00~PM 12:00');
    });

    // vm 컨텍스트에서 만든 객체라 prototype 이 달라 deepStrictEqual({},{}) 는
    // 실패한다. 여기서 볼 건 '아무 요일도 안 잡혔다' 뿐이므로 키로 센다.
    test('빈 값·시간 없는 글은 아무 요일도 안 잡는다', () => {
        ['', null, undefined, '협의 후 결정', '월요일에 만나요'].forEach((v) =>
            assert.strictEqual(Object.keys(parse(v)).length, 0, JSON.stringify(v)));
    });

    test('같은 요일이 두 번 나오면 뒤엣것이 이긴다', () => {
        const r = parse('수 10:00~12:00, 수 19:00~21:00');
        assert.strictEqual(hhmm(r['수']), '19:00~21:00');
    });
});
