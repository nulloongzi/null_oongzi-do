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

// dom-utils.js 는 IIFE 안에서 window.* 에 붙인다. 통째로 실행해 위치 헬퍼를 얻는다.
const domSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'dom-utils.js'), 'utf-8');

// auth.js 는 firebase 전역에 의존하므로 필요한 두 함수만 꺼내 쓴다.
const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf-8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
[/window\.clubAdminUids = function[\s\S]*?\n\};/, /window\.canModifyClub = function[\s\S]*?\n\};/]
    .forEach((re) => vm.runInContext(authSrc.match(re)[0], sandbox));
vm.runInContext('window.MAX_CLUB_ADMINS = 3;', sandbox);
vm.runInContext(domSrc, sandbox);
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

describe('위치 공개 수준 — 웹과 서버가 같은 답을 낸다', () => {
    // 규칙·서버·웹 세 곳에 같은 계산이 있다. 어긋나면 폼은 통과시키는데 저장이
    // 거부되거나(사용자는 이유를 모른다), 반대로 흐렸다고 안내하고 정확한 값을
    // 저장하는 최악이 된다.
    const ADDRESSES = [
        '서울 성북구 화랑로13길 144',
        '경기도 성남시 분당구 양현로 262',
        '세종특별자치시 다정남로 91',
        '구리 여자중학교 체육관(경기도 구리시 벌말로 168)',
        '하남종합운동장국민체육센터',
        '경기 광명시 가림로 18 하안북초등학교',
        ''
    ];
    ADDRESSES.forEach((addr) => {
        test('areaLabel: ' + JSON.stringify(addr), () => {
            assert.strictEqual(web.areaLabel(addr), pure.areaLabel(addr));
        });
    });

    const COORDS = [37.6051234, 127.0573891, 35.1, 129.99999, 33.0, 38.5, 126.9];
    test('roundToAreaGrid 가 서버와 비트 단위로 같다', () => {
        COORDS.forEach((v) => {
            assert.strictEqual(web.roundToAreaGrid(v), pure.roundToAreaGrid(v), 'v=' + v);
        });
    });

    // 규칙은 v*200 이 정수인지로 판정한다. 웹이 만든 값이 그 판정을 통과해야
    // 저장이 된다 — 여기가 어긋나면 '대략만'을 고른 팀이 저장을 못 한다.
    test('웹이 만든 좌표는 규칙의 격자 판정을 통과한다', () => {
        COORDS.forEach((v) => {
            const r = web.roundToAreaGrid(v);
            assert.ok(Math.abs(r * 200 - Math.round(r * 200)) < 0.000001, 'v=' + v + ' → ' + r);
            assert.strictEqual(pure.isAreaGridAligned(r), true, 'v=' + v);
        });
    });

    test('isAreaOnly 기본값이 서버와 같다', () => {
        [{}, null, { location_precision: 'area' }, { location_precision: 'exact' },
            { location_precision: 'rough' }].forEach((club) => {
            assert.strictEqual(web.isAreaOnly(club), pure.isAreaOnly(club), JSON.stringify(club));
        });
    });
});

describe('장소 검색 질의 변형 — 웹과 서버가 같은 답을 낸다', () => {
    const QUERIES = [
        '광남초등학교 체육관',
        '오산 죽미 다목적 체육관',
        '석관중',
        '서울 강남구 삼성로135길 42',
        '하남종합운동장국민체육센터',
        '구리 여자중학교 체육관',
        '체육관',
        '  공백   많은   입력  ',
        ''
    ];
    QUERIES.forEach((q) => {
        test(JSON.stringify(q), () => {
            assert.deepStrictEqual(plain(web.placeQueryVariants(q)), pure.placeQueryVariants(q));
        });
    });
});
