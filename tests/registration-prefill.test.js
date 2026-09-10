// tests/registration-prefill.test.js
// 팀 정보 수정 폼의 프리필 — 저장된 값이 폼으로 되돌아오는가.
//
// 2026-09-10 신고: 수정 버튼을 누르면 모집 대상 '기타'란과 운동 시간이 빈 채로
// 떠서 다시 입력해야 했다. 불편에서 끝나지 않는다 — 기타란은 그대로 저장하면
// 괄호 안 내용이 **소리 없이 삭제**된다(저장은 `base (note)` 로 합치는데
// 복원이 note 를 못 꺼냈다).
//
// registration.js 는 DOM 을 만지므로, 순수 함수 두 개만 vm 으로 캡처해 검증한다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf-8');
const sandbox = { window: {}, document: { getElementById: () => null }, console };
vm.createContext(sandbox);
// parseScheduleText 가 먼저 있어야 scheduleBlocksFromText 가 그걸 쓴다.
vm.runInContext(
    read('club-detail.js').match(/window\.parseScheduleText = function[\s\S]*?\n\};/)[0], sandbox);
const regSrc = read('registration.js');
['window.scheduleBlocksFromText = function', 'window.parseTargetValue = function'].forEach((sig) => {
    const re = new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\n\\};');
    vm.runInContext(regSrc.match(re)[0], sandbox);
});
const { parseTargetValue, scheduleBlocksFromText } = sandbox.window;

// vm 컨텍스트에서 만든 객체·배열은 prototype 이 달라 deepStrictEqual 이 걸린다.
// 값만 보면 되므로 호스트 쪽 구조로 옮겨 비교한다.
const plain = (v) => JSON.parse(JSON.stringify(v));

const CHIPS = ['성인', '대학생', '청소년', '무관', '여성전용', '남성전용', '선출가능', '6인제'];
const pt = (s) => parseTargetValue(s, CHIPS);

describe('parseTargetValue — 모집 대상 칩 + 기타 메모 복원', () => {
    // 실제로 신고된 모양. 이게 안 되면 재저장 때 메모가 사라진다.
    test('괄호 안을 메모로 되살린다 (회귀)', () => {
        const r = pt('성인, 대학생 (구력 1년 이상)');
        assert.deepStrictEqual(plain(r.chips), ['성인', '대학생']);
        assert.strictEqual(r.note, '구력 1년 이상');
    });

    test('칩만 있으면 메모는 빈 값', () => {
        const r = pt('성인, 여성전용');
        assert.deepStrictEqual(plain(r.chips), ['성인', '여성전용']);
        assert.strictEqual(r.note, '');
    });

    test('메모만 있는 경우', () => {
        const r = pt('(주말만 운영)');
        assert.deepStrictEqual(plain(r.chips), []);
        assert.strictEqual(r.note, '주말만 운영');
    });

    // 칩 도입 전 자유입력분. 버리면 재저장 때 사라지므로 메모로 살린다.
    test('괄호 없는 잔여 표현도 메모로 살린다', () => {
        const r = pt('성인 남녀');
        assert.deepStrictEqual(plain(r.chips), ['성인']);
        assert.strictEqual(r.note, '남녀');
    });

    test('구분자만 남으면 메모는 비운다', () => {
        assert.strictEqual(pt('성인, 대학생').note, '');
        assert.strictEqual(pt('성인 · 청소년').note, '');
    });

    test('빈 값·null 안전', () => {
        [null, undefined, '', '   '].forEach((v) => {
            const r = pt(v);
            assert.deepStrictEqual(plain(r.chips), []);
            assert.strictEqual(r.note, '');
        });
    });

    // 저장(getRegTargetValue)과 복원이 맞물리는지 — 왕복해도 그대로여야 한다.
    test('저장 포맷 왕복', () => {
        [['성인, 대학생', '구력 1년 이상'], ['여성전용', ''], ['', '문의 후 결정']]
            .forEach(([base, note]) => {
                const saved = note ? (base ? `${base} (${note})` : note) : base;
                const r = pt(saved);
                assert.strictEqual(r.chips.join(', '), base, saved);
                assert.strictEqual(r.note, note, saved);
            });
    });
});

describe('scheduleBlocksFromText — schedule_raw 없는 문서의 시간 복원', () => {
    // 구글시트로 접수된 초기 팀들은 schedule 텍스트만 있고 schedule_raw 가 없다.
    test('요일별 시간을 블록으로 되살린다 (회귀)', () => {
        const b = scheduleBlocksFromText('수 19:00~21:30, 일 14:00~18:00');
        assert.strictEqual(b.length, 2);
        assert.deepStrictEqual(plain(b[0]), { start: '19:00', end: '21:30', days: ['수'] });
        assert.deepStrictEqual(plain(b[1]), { start: '14:00', end: '18:00', days: ['일'] });
    });

    // 같은 시간대는 한 블록에 여러 요일 칩으로 — schedule_raw 경로와 같은 모양.
    test('같은 시간대는 한 블록으로 묶는다', () => {
        const b = scheduleBlocksFromText('월, 수, 금 19:00~22:00');
        assert.strictEqual(b.length, 1);
        assert.deepStrictEqual(plain(b[0].days), ['월', '수', '금']);
        assert.strictEqual(b[0].start, '19:00');
    });

    test('요일 순서는 월~일 고정', () => {
        const b = scheduleBlocksFromText('일 10:00~12:00, 월 10:00~12:00');
        assert.deepStrictEqual(plain(b[0].days), ['월', '일']);
    });

    test('한 자리 시각도 HH:MM 으로 채운다 (select 값과 맞아야 선택됨)', () => {
        const b = scheduleBlocksFromText('토 6:00~8:30');
        assert.deepStrictEqual(plain(b[0]), { start: '06:00', end: '08:30', days: ['토'] });
    });

    test('빈 값·시간 없는 글은 빈 배열 (호출부가 빈 블록 하나를 띄운다)', () => {
        ['', null, undefined, '협의 후 결정'].forEach((v) =>
            assert.deepStrictEqual(plain(scheduleBlocksFromText(v)), [], JSON.stringify(v)));
    });
});
