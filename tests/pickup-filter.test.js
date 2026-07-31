// tests/pickup-filter.test.js
// 픽업 목록 필터(지역·English OK·키워드) 순수 로직 검증.
// 실행: node --test tests/pickup-filter.test.js
//
// js/pickup-filter.js 는 IIFE로 window.* 에 헬퍼를 할당하는 classic script (dom-utils와 동일 패턴).
// 카카오 SDK/DOM 의존이 없어 vm 샌드박스에서 그대로 돌릴 수 있다.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'js', 'pickup-filter.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf-8');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(scriptSource, sandbox);
const { pickupRegionMatch, pickupLevelMatch, filterPickupSpots, PICKUP_REGIONS } = sandbox.window;

describe('PICKUP_LEVELS', () => {
    test('4단계 — USAV B/BB/A/AA·Open 을 접은 값 집합', () => {
        assert.deepStrictEqual(
            Array.from(sandbox.window.PICKUP_LEVELS),
            ['beginner', 'intermediate', 'advanced', 'elite'],
        );
    });
});

describe('pickupLevelMatch', () => {
    test('레벨 미지정이면 전부 통과', () => {
        assert.strictEqual(pickupLevelMatch({ level: 'advanced' }, ''), true);
    });

    test('같은 레벨만 매칭', () => {
        assert.strictEqual(pickupLevelMatch({ level: 'beginner' }, 'beginner'), true);
        assert.strictEqual(pickupLevelMatch({ level: 'advanced' }, 'beginner'), false);
    });

    test("'레벨무관' 크루는 어떤 레벨 필터에도 걸린다 (누구나 환영이므로 후보에서 빠지면 안 됨)", () => {
        assert.strictEqual(pickupLevelMatch({ level: 'any' }, 'beginner'), true);
        assert.strictEqual(pickupLevelMatch({ level: 'any' }, 'advanced'), true);
    });

    test('level 필드가 없으면 any 로 취급', () => {
        assert.strictEqual(pickupLevelMatch({}, 'beginner'), true);
    });

    test('elite 도 다른 등급과 동일 규칙', () => {
        assert.strictEqual(pickupLevelMatch({ level: 'elite' }, 'elite'), true);
        assert.strictEqual(pickupLevelMatch({ level: 'elite' }, 'beginner'), false);
        assert.strictEqual(pickupLevelMatch({ level: 'any' }, 'elite'), true);
    });
});

describe('PICKUP_REGIONS', () => {
    test('동호회 필터와 같은 8개 지역', () => {
        // vm 샌드박스 배열이라 prototype이 달라 Array.from 으로 현 realm 배열로 옮겨 비교한다.
        assert.deepStrictEqual(Array.from(PICKUP_REGIONS), ['서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주']);
    });
});

describe('pickupRegionMatch', () => {
    test('지역 미지정이면 전부 통과', () => {
        assert.strictEqual(pickupRegionMatch({ region: '경기' }, ''), true);
        assert.strictEqual(pickupRegionMatch({}, ''), true);
    });

    test('region 필드가 우선 — 좌표/주소 없어도 매칭된다', () => {
        assert.strictEqual(pickupRegionMatch({ region: '서울' }, '서울'), true);
        assert.strictEqual(pickupRegionMatch({ region: '경기' }, '서울'), false);
    });

    test('region 필드가 광역 묶음의 하위값이어도 매칭', () => {
        assert.strictEqual(pickupRegionMatch({ region: '대전' }, '충청'), true);
        assert.strictEqual(pickupRegionMatch({ region: '부산' }, '경상'), true);
        assert.strictEqual(pickupRegionMatch({ region: '광주' }, '전라'), true);
        assert.strictEqual(pickupRegionMatch({ region: '부산' }, '충청'), false);
    });

    test('region 없으면 주소 prefix 폴백 (칩 도입 이전 문서 호환)', () => {
        assert.strictEqual(pickupRegionMatch({ address: '서울 송파구 올림픽로 25' }, '서울'), true);
        assert.strictEqual(pickupRegionMatch({ address: '경기 성남시 분당구' }, '서울'), false);
    });

    test('주소 폴백도 광역 묶음을 편다', () => {
        assert.strictEqual(pickupRegionMatch({ address: '대전 유성구' }, '충청'), true);
        assert.strictEqual(pickupRegionMatch({ address: '울산 남구' }, '경상'), true);
        assert.strictEqual(pickupRegionMatch({ address: '전북 전주시' }, '전라'), true);
    });

    test('prefix 매칭이라 주소 중간에 지역명이 있어도 걸리지 않는다', () => {
        assert.strictEqual(pickupRegionMatch({ address: '경기 서울대입구로 1' }, '서울'), false);
    });

    test('region·주소 둘 다 없으면 지역 필터가 걸릴 때 제외', () => {
        assert.strictEqual(pickupRegionMatch({ title: '수요 픽업' }, '서울'), false);
    });

    test('region 필드가 있으면 주소는 보지 않는다 (칩이 진실)', () => {
        assert.strictEqual(pickupRegionMatch({ region: '서울', address: '경기 성남시' }, '서울'), true);
        assert.strictEqual(pickupRegionMatch({ region: '경기', address: '서울 강남구' }, '서울'), false);
    });
});

describe('filterPickupSpots', () => {
    const spots = [
        { id: 'a', title: 'Seoul Sunday 6s', region: '서울', english_ok: true, insta: 'seoul6s' },
        { id: 'b', title: '수요 픽업', address: '서울 마포구 월드컵로', english_ok: false },
        { id: 'c', title: 'Busan Beach', region: '경상', english_ok: true, venue_name: '해운대' },
        { id: 'd', title: '떠돌이 크루', english_ok: true }, // 지역·주소 없음
    ];

    test('필터 없으면 전부', () => {
        assert.strictEqual(filterPickupSpots(spots, {}).length, 4);
        assert.strictEqual(filterPickupSpots(spots).length, 4);
    });

    test('englishOnly', () => {
        const r = filterPickupSpots(spots, { englishOnly: true }).map((s) => s.id);
        assert.deepStrictEqual(r, ['a', 'c', 'd']);
    });

    test('region — region 필드와 주소 폴백을 함께 잡는다', () => {
        const r = filterPickupSpots(spots, { region: '서울' }).map((s) => s.id);
        assert.deepStrictEqual(r, ['a', 'b']);
    });

    test('region + englishOnly 조합 (외국인에게 보낼 목록)', () => {
        const r = filterPickupSpots(spots, { region: '서울', englishOnly: true }).map((s) => s.id);
        assert.deepStrictEqual(r, ['a']);
    });

    test('키워드는 제목/장소/주소/인스타를 훑고 대소문자를 무시한다', () => {
        // 'b'는 주소가 한글('서울 마포구')이라 라틴 키워드에는 걸리지 않는다 — 의도된 동작.
        assert.deepStrictEqual(filterPickupSpots(spots, { keyword: 'SEOUL' }).map((s) => s.id), ['a']);
        assert.deepStrictEqual(filterPickupSpots(spots, { keyword: '서울' }).map((s) => s.id), ['b']);
        assert.deepStrictEqual(filterPickupSpots(spots, { keyword: '해운대' }).map((s) => s.id), ['c']);
        assert.deepStrictEqual(filterPickupSpots(spots, { keyword: 'seoul6s' }).map((s) => s.id), ['a']);
    });

    test('키워드 공백은 무시', () => {
        assert.strictEqual(filterPickupSpots(spots, { keyword: '   ' }).length, 4);
    });

    test('레벨 필터 — any 크루는 남고 다른 레벨은 빠진다', () => {
        const lv = [
            { id: 'beg', title: '입문', level: 'beginner' },
            { id: 'adv', title: '고급', level: 'advanced' },
            { id: 'any', title: '무관', level: 'any' },
            { id: 'none', title: '미지정' },
        ];
        assert.deepStrictEqual(
            filterPickupSpots(lv, { level: 'beginner' }).map((s) => s.id),
            ['beg', 'any', 'none'],
        );
        assert.deepStrictEqual(
            filterPickupSpots(lv, { level: 'advanced' }).map((s) => s.id),
            ['adv', 'any', 'none'],
        );
    });

    test('지역+레벨+English 조합', () => {
        const mix = [
            { id: 'a', title: 'A', region: '서울', level: 'beginner', english_ok: true },
            { id: 'b', title: 'B', region: '서울', level: 'advanced', english_ok: true },
            { id: 'c', title: 'C', region: '경기', level: 'beginner', english_ok: true },
            { id: 'd', title: 'D', region: '서울', level: 'beginner', english_ok: false },
        ];
        assert.deepStrictEqual(
            filterPickupSpots(mix, { region: '서울', level: 'beginner', englishOnly: true }).map((s) => s.id),
            ['a'],
        );
    });

    test('좌표 없는 크루도 목록에는 남는다 (지도에만 안 뜸)', () => {
        const r = filterPickupSpots(spots, { englishOnly: true }).map((s) => s.id);
        assert.ok(r.includes('d'));
    });

    test('빈 입력에도 터지지 않는다', () => {
        assert.deepStrictEqual(Array.from(filterPickupSpots(null, { region: '서울' })), []);
        assert.deepStrictEqual(Array.from(filterPickupSpots([], {})), []);
    });
});
