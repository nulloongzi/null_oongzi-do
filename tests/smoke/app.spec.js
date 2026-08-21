// tests/smoke/app.spec.js — 헤드리스 스모크: "한 바퀴 싹 돌리기" (방법론 웹 티어 3).
//
// 검증 정책:
//  · 페이지 에러(uncaught) 0 — 단, 외부 SDK(kakao/firebase CDN) 가용성에 좌우되는
//    에러는 허용목록으로 제외해 결정성 확보. 우리 코드의 오타/미정의 참조 회귀는 잡힘.
//  · 패리티 DOM: 검색(#fsKeyword)·필터시트·탭·언어토글 등 핵심 UI 존재.
//  · 인터랙션: 필터시트 열기, KO↔EN 토글이 실제 DOM 텍스트를 바꾸는지.
'use strict';
/* global window, history -- addInitScript·evaluate 콜백은 브라우저 컨텍스트에서 실행됨 */

const { test, expect } = require('@playwright/test');

// 외부 SDK 부재/차단에서 비롯되는 에러만 허용 (우리 코드 회귀는 통과 불가)
const EXTERNAL_ERROR = /kakao|firebase|gstatic|html2canvas|qrcode|Failed to fetch|NetworkError|ERR_/i;

function collectPageErrors(page, sink) {
    page.on('pageerror', (err) => {
        if (!EXTERNAL_ERROR.test(String(err && err.message))) sink.push(err);
    });
}

test('로드: 타이틀 + 앱 자체 페이지 에러 0', async ({ page }) => {
    const errors = [];
    collectPageErrors(page, errors);
    await page.goto('/');
    // i18n이 로케일에 따라 타이틀을 KO/EN으로 바꿈 → 언어 무관 부분으로 검증
    await expect(page).toHaveTitle(/Nulloongzi-do/i);
    await page.waitForTimeout(1500); // 지연 초기화 에러 수집 여유
    expect(errors, errors.map(String).join('\n')).toEqual([]);
});

test('패리티 DOM: 핵심 UI 요소 존재', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeAttached();
    await expect(page.locator('#fsKeyword')).toBeAttached(); // 필터시트 검색 인풋(패리티 항목)
    await expect(page.locator('#filterSheet')).toBeAttached();
    await expect(page.locator('#tabClubs')).toBeVisible();
    await expect(page.locator('#tabPickup')).toBeVisible();
    await expect(page.locator('#langToggle')).toBeVisible();
    await expect(page.locator('#filterBtnIcon')).toBeVisible();
});

test('인터랙션: 필터 시트 열기', async ({ page }) => {
    await page.goto('/');
    await page.locator('#filterBtnIcon').click();
    // openFilterSheet()가 시트를 표시 상태로 전환해야 함
    await expect(page.locator('#filterSheet')).toHaveClass(/open|show|active/, { timeout: 3000 })
        .catch(async () => {
            // 클래스 컨벤션이 다르면 가시성으로 폴백 판정
            await expect(page.locator('#filterSheet')).toBeVisible();
        });
    await expect(page.locator('#fsKeyword')).toBeVisible();
});

// 카카오/네이버는 리다이렉트 로그인 → 복귀 후 토큰 교환 구간이 비어 보이면 안 된다.
// 외부 SDK를 차단해 결정적으로 만들고, 토큰 교환은 끝나지 않는 Promise로 흉내낸다.
async function stubSlowTokenExchange(page) {
    await page.route('**', (route) => {
        const url = route.request().url();
        return url.startsWith('http://localhost:4173') ? route.continue() : route.abort();
    });
    await page.addInitScript(() => {
        window.firebaseCallable = function () {
            return function () { return new Promise(function () {}); };
        };
    });
}

test('소셜 로그인 복귀(?code=&state=): 로그인 중 안내가 뜬다', async ({ page }) => {
    await stubSlowTokenExchange(page);
    await page.goto('/?code=dummy&state=kakao_dummy');
    await expect(page.locator('#authLoadingOverlay')).toBeVisible();
    await expect(page.locator('#authLoadingTitle')).not.toBeEmpty();
    // 제공자별 반투명 효과 테마가 state 접두사로 결정되는지
    await expect(page.locator('html')).toHaveClass(/auth-theme-kakao/);
});

test('일반 방문에는 로그인 안내가 뜨지 않는다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#authLoadingOverlay')).toBeHidden();
});

test('소셜 로그인 취소(?error=): 안내를 내리고 URL을 정리한다', async ({ page }) => {
    await stubSlowTokenExchange(page);
    await page.goto('/?error=access_denied&state=naver_dummy');
    await expect(page.locator('#authLoadingOverlay')).toBeHidden();
    await expect.poll(() => page.url()).not.toContain('error=');
});

test('인터랙션: KO↔EN 언어 토글이 DOM 텍스트를 바꿈', async ({ page }) => {
    await page.goto('/');
    const tab = page.locator('#tabClubs');
    const before = (await tab.textContent()).trim();
    await page.locator('#langToggle').click();
    await expect(tab).not.toHaveText(before, { timeout: 3000 });
    // 원복 (localStorage 저장 동작 확인 겸)
    await page.locator('#langToggle').click();
    await expect(tab).toHaveText(before, { timeout: 3000 });
});

// 픽업 탭 크롬 스왑 — 목록이 하단 46vh를 차지하므로 그 위에 뜨던 FAB을 정리한다.
// 도시락(🍱)·네임카드(🍚)는 로그인 기능이고 픽업은 무로그인 발견 wedge라 숨긴다.
// 등록 FAB은 동호회(팀등록) ↔ 픽업(픽업등록) 으로 같은 자리를 물려받는다.
test('픽업 탭: 로그인 전용 FAB 숨김 + 등록 FAB 스왑', async ({ page }) => {
    await page.goto('/');

    // 동호회(기본) 상태
    await expect(page.locator('#fabLunchbox')).toBeVisible();
    await expect(page.locator('#fabProfile')).toBeVisible();
    await expect(page.locator('#fabClubRegister')).toBeVisible();
    await expect(page.locator('#fabPickupCreate')).toBeHidden();
    await expect(page.locator('#fabLineup')).toBeHidden();

    await page.locator('#tabPickup').click();

    // 픽업 상태: 로그인 FAB 사라지고 등록 FAB이 바뀐다
    await expect(page.locator('#fabLunchbox')).toBeHidden();
    await expect(page.locator('#fabProfile')).toBeHidden();
    await expect(page.locator('#fabClubRegister')).toBeHidden();
    await expect(page.locator('#fabPickupCreate')).toBeVisible();
    await expect(page.locator('#fabLineup')).toBeVisible();
    // 지도 조작인 내 위치는 남고, 목록 패널이 뜬다
    await expect(page.locator('#pickupListPanel')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/pickup-mode/);

    // 동호회로 돌아오면 원상복구 (스왑이 단방향이면 여기서 깨진다)
    await page.locator('#tabClubs').click();
    await expect(page.locator('#fabLunchbox')).toBeVisible();
    await expect(page.locator('#fabProfile')).toBeVisible();
    await expect(page.locator('#fabClubRegister')).toBeVisible();
    await expect(page.locator('#fabPickupCreate')).toBeHidden();
    await expect(page.locator('#fabLineup')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/pickup-mode/);
});

// 배치 도구는 지도 SDK를 안 쓰는 독립 페이지라 오버레이가 아니라 페이지 이동으로 연다.
// 필터가 실린 URL 에 착지시켜 두고 왕복하면, 돌아왔을 때 필터가 살아있는지까지 확인된다.
// 탭은 직접 누른다 — ?tab=pickup 자동 복원은 loadAllClubs().then() 안이라
// Firebase 가 막힌 환경에서 안 돌고, 여기서 보려는 건 그 복원이 아니라 왕복이다.
test('배치 도구: 픽업 FAB → 독립 페이지, 돌아오면 필터가 실린 URL 유지', async ({ page }) => {
    const errors = [];
    collectPageErrors(page, errors);

    await page.goto('/');
    await page.locator('#tabPickup').click();
    // 필터를 켠 상태로 만든다. 클릭 대신 상태를 직접 세우는 이유는 토글 핸들러가
    // renderPickupMarkers(카카오 SDK)를 먼저 타서 SDK 차단 환경에선 비결정적이기 때문.
    await page.evaluate(() => { window.pkEnglishOnly = true; });
    await expect(page.locator('#fabLineup')).toBeVisible();

    await page.locator('#fabLineup').click();
    await expect.poll(() => page.url()).toContain('gvt-lineup.html');
    await expect.poll(() => page.url()).toContain('lang='); // 호스트 언어를 물려받는 경로

    // 도구 자체도 페이지 에러 0 (전역 77개짜리 단일 파일이라 회귀가 잘 난다)
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('#backBtn')).toBeVisible();
    await page.waitForTimeout(800);
    expect(errors, errors.map(String).join('\n')).toEqual([]);

    // 돌아가기 → openLineupTool 이 박아둔 URL 그대로라 탭과 필터가 살아있다
    await page.locator('#backBtn').click();
    await expect.poll(() => page.url()).not.toContain('gvt-lineup.html');
    await expect.poll(() => page.url()).toContain('tab=pickup');
    await expect.poll(() => page.url()).toContain('english=1');
});

// 주소창으로 도구를 직접 열면(referrer 없음) 뒤로 갈 곳이 없다 → 픽업 탭 URL 로 폴백.
test('배치 도구: 직접 진입 시 돌아가기는 픽업 탭으로 폴백', async ({ page }) => {
    await page.goto('/gvt-lineup.html');
    await expect(page.locator('#backBtn')).toBeVisible();
    await page.locator('#backBtn').click();
    await expect.poll(() => page.url()).toContain('tab=pickup');
    await expect(page.locator('#tabPickup')).toBeVisible();
});

// 헤더 과밀 회귀 방지: 필터 3종은 한 줄(.pl-filters), 등록 버튼은 헤더에 없어야 한다.
test('픽업 목록 헤더: 필터 한 줄 + 등록 버튼은 헤더 밖', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabPickup').click();

    const filters = page.locator('.pl-filters');
    await expect(filters).toBeVisible();
    await expect(filters.locator('#pkRegionFilter')).toBeVisible();
    await expect(filters.locator('#pkLevelFilter')).toBeVisible();
    await expect(filters.locator('#pkEnFilter')).toBeVisible();

    // 등록은 FAB으로 빠졌으므로 헤더 안에 버튼이 남아 있으면 안 된다
    await expect(page.locator('.pl-header .pl-host-btn')).toHaveCount(0);
});
