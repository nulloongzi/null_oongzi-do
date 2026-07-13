// tests/smoke/app-banner.spec.js — 앱 설치 배너(웹→앱 유입 깔때기) 스모크.
//
// 검증:
//  · Android UA 에서 배너가 슬라이드 인(.show)되고 CTA 가 Play Store 패키지로 연결.
//  · 닫기 → body.app-banner-on 제거 + localStorage 기록 + 재로드 시 7일 내 재노출 안 함.
//  · ?club= 딥링크 컨텍스트에서 강화 문구 노출.
//  · 비-Android(데스크톱) UA 에서는 미노출.
'use strict';

/* global localStorage */ // page.evaluate/addInitScript 콜백은 브라우저 컨텍스트에서 실행됨

const { test, expect } = require('@playwright/test');

const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

test.describe('앱 설치 배너 — Android', () => {
    test.use({ userAgent: ANDROID_UA });

    test('노출 + CTA(Play Store) + 닫기 지속', async ({ page }) => {
        await page.goto('/');
        const banner = page.locator('.app-install-banner');
        await expect(banner).toHaveClass(/show/);
        await expect(page.locator('body')).toHaveClass(/app-banner-on/);

        await expect(page.locator('.aib-cta')).toHaveAttribute(
            'href', /play\.google\.com.*com\.nulloongzi\.nulloongzido/
        );

        await page.locator('.aib-close').click();
        await expect(page.locator('body')).not.toHaveClass(/app-banner-on/);
        const dismissed = await page.evaluate(
            () => localStorage.getItem('nulloong_app_banner_dismissed')
        );
        expect(dismissed).toBeTruthy();

        // 재로드 → 7일 내라 재노출 안 함
        await page.reload();
        await page.waitForTimeout(600);
        await expect(page.locator('.app-install-banner')).toHaveCount(0);
    });

    test('딥링크(?club=) 컨텍스트 강화 문구', async ({ page }) => {
        // 로케일 결정성: KO 로 고정 후 딥링크 문구 검증
        await page.addInitScript(() => {
            try { localStorage.setItem('nulloong_lang', 'ko'); } catch (e) { /* ignore */ }
        });
        await page.goto('/?club=nonexistent');
        await expect(page.locator('.app-install-banner .aib-sub')).toHaveText('이 팀을 앱에서 열어보세요');
    });
});

test.describe('앱 설치 배너 — 데스크톱', () => {
    test('비-Android UA 에서는 미노출', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(600);
        await expect(page.locator('.app-install-banner')).toHaveCount(0);
    });
});
