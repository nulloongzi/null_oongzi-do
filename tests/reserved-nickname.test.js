// tests/reserved-nickname.test.js — 예약 닉네임 판정(js/profile.js isReservedNickname)과
// firestore.rules isReservedNickname 이 같은 목록인지 대조한다. 어긋나면 화면은 통과시키는데
// 저장이 거부되거나(원인 모를 오류), 화면이 막는데 룰은 열린 상태가 된다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf-8');
const profileSrc = fs.readFileSync(path.join(root, 'js', 'profile.js'), 'utf-8');

const window = {};
// isReservedNickname 정의부만 떼어 실행(profile.js 전체는 DOM 을 요구한다)
const start = profileSrc.indexOf('var RESERVED_NICK_RE');
const end = profileSrc.indexOf('};', profileSrc.indexOf('window.isReservedNickname')) + 2;
vm.runInContext(profileSrc.slice(start, end), vm.createContext({ window }));

describe('예약 닉네임 판정', () => {
    test('룰과 웹이 같은 단어 목록', () => {
        const ruleWords = /matches\('\.\*\(([^)]*)\)\.\*'\)/.exec(rules)[1].split('|');
        const webWords = /RESERVED_NICK_RE = \/\(([^)]*)\)\//.exec(profileSrc)[1].split('|');
        assert.deepStrictEqual(webWords, ruleWords);
        assert.ok(ruleWords.includes('누룽지') && ruleWords.includes('nulloongzi'));
        // 정규화(기호 제거)도 같은 문자 집합
        assert.ok(rules.includes("replace('[^a-z0-9가-힣]', '')"));
        assert.ok(profileSrc.includes('replace(/[^a-z0-9가-힣]/g, \'\')'));
    });
    test('변형도 걸린다', () => {
        for (const n of ['누룽지', '누룽지2', '누 룽 지', '누룽지도', 'Nulloongzi', 'NULL_OONGZI', 'null-oongzi', 'Null.Oongzi', 'nurungji', 'x누룽지x'])
            assert.strictEqual(window.isReservedNickname(n), true, n);
    });
    test('보통 이름은 통과', () => {
        for (const n of ['현미밥-a3k', '누룽', '룽지', '밥아저씨', 'null', 'oongzi', '', null])
            assert.strictEqual(window.isReservedNickname(n), false, String(n));
    });
});
