// playwright.config.js — 헤드리스 스모크 (방법론 웹 티어 3).
// 로컬 정적 서버로 index.html을 실제 브라우저에서 "한 바퀴" 돌린다.
'use strict';

const fs = require('node:fs');
const { defineConfig } = require('@playwright/test');

// 샌드박스 환경: 프리인스톨 Chromium 심볼릭 링크 사용 (버전 불일치 회피).
// CI/일반 환경: playwright install 경로 사용.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  !process.env.CI && fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined;

module.exports = defineConfig({
  testDir: 'tests/smoke',
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0, // 외부 CDN 흔들림 1회 완충
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'node tests/smoke/serve.js 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
