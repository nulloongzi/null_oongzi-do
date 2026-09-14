// tests/club-admins.test.js
// 팀 관리자 판정이 웹·서버·규칙 세 곳에서 **같은 답**을 내는지.
//
// 같은 규칙이 세 군데(js/auth.js · functions/lib/pure.js · firestore.rules)에
// 따로 적혀 있다. 어긋나면 화면엔 수정 버튼이 보이는데 저장은 거부되는,
// 사용자가 원인을 알 수 없는 상태가 된다. 규칙 쪽은 에뮬레이터 테스트가 보고,
// 여기서는 웹과 서버 구현이 서로 어긋나지 않는지 본다.
//
// 실행: node --test tests/club-admins.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pure = require('../functions/lib/pure');

// auth.js 는 firebase 전역에 의존하므로 필요한 두 함수만 꺼내 쓴다.
const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf-8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
[/window\.clubAdminUids = function[\s\S]*?\n\};/, /window\.canModifyClub = function[\s\S]*?\n\};/]
    .forEach((re) => vm.runInContext(authSrc.match(re)[0], sandbox));
vm.runInContext('window.MAX_CLUB_ADMINS = 3;', sandbox);
const web = sandbox.window;

// vm 안에서 만든 배열은 prototype 이 달라 deepStrictEqual 이 걸린다. 값만 본다.
const plain = (v) => JSON.parse(JSON.stringify(v));

const CASES = [
    ['admins 배열', { admins: ['a', 'b'] }],
    ['구 문서(registered_by 만)', { registered_by: 'owner' }],
    ['admins 가 이기고 registered_by 는 무시', { admins: ['a'], registered_by: 'owner' }],
    ['중복·공백 정리', { admins: ['a', ' a ', '', 'b'] }],
    ['빈 팀', {}],
    ['정원', { admins: ['a', 'b', 'c'] }]
];

describe('웹 clubAdminUids 가 서버 pure.clubAdminUids 와 같은 답을 낸다', () => {
    CASES.forEach(([label, club]) => {
        test(label, () => {
            assert.deepStrictEqual(plain(web.clubAdminUids(club)), pure.clubAdminUids(club));
        });
    });
});

describe('웹 canModifyClub 이 서버 canManageClub 과 같은 답을 낸다', () => {
    const UIDS = ['a', 'b', 'c', 'owner', 'stranger', ''];
    CASES.forEach(([label, club]) => {
        test(label, () => {
            UIDS.forEach((uid) => {
                sandbox.window.currentUser = uid ? { uid } : null;
                sandbox.window.isAdmin = false;
                assert.strictEqual(
                    web.canModifyClub(club), pure.canManageClub(club, uid),
                    label + ' / uid=' + JSON.stringify(uid)
                );
            });
        });
    });

    test('운영자(isAdmin)는 어느 팀이든 고칠 수 있다', () => {
        sandbox.window.currentUser = { uid: 'stranger' };
        sandbox.window.isAdmin = true;
        assert.strictEqual(web.canModifyClub({ admins: ['a'] }), true);
    });

    test('비로그인은 못 고친다', () => {
        sandbox.window.currentUser = null;
        sandbox.window.isAdmin = false;
        assert.strictEqual(web.canModifyClub({ admins: ['a'] }), false);
    });

    // 정원 상수가 세 곳에서 갈라지면 UI 는 신청을 받고 서버는 거절한다.
    test('정원 상수가 서버와 같다', () => {
        assert.strictEqual(web.MAX_CLUB_ADMINS, pure.MAX_CLUB_ADMINS);
    });
});
