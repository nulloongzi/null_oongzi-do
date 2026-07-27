// tests/smoke/app.spec.js — 헤드리스 스모크: "한 바퀴 싹 돌리기" (방법론 웹 티어 3).
//
// 검증 정책:
//  · 페이지 에러(uncaught) 0 — 단, 외부 SDK(kakao/firebase CDN) 가용성에 좌우되는
//    에러는 허용목록으로 제외해 결정성 확보. 우리 코드의 오타/미정의 참조 회귀는 잡힘.
//  · 패리티 DOM: 검색(#fsKeyword)·필터시트·탭·언어토글 등 핵심 UI 존재.
//  · 인터랙션: 필터시트 열기, KO↔EN 토글이 실제 DOM 텍스트를 바꾸는지.
'use strict';
/* global window -- addInitScript 콜백은 브라우저 컨텍스트에서 실행됨 */

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
