// ESLint flat config (v9) — 누룽지도 웹.
// 목표: 리팩터 없이 "진짜 버그"(미정의 참조·중복 키·도달불가 코드·오타)만 게이팅.
// js/ 는 classic script(IIFE, window.* 전역 통신, Firebase compat, Kakao SDK) 라
// 브라우저 + 서드파티 전역을 readonly 로 선언한다.
'use strict';

const js = require('@eslint/js');

// 브라우저 표준 전역 (핵심만) — no-undef 오탐 방지용.
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  FormData: 'readonly',
  FileReader: 'readonly',
  Image: 'readonly',
  XMLHttpRequest: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  IntersectionObserver: 'readonly',
  MutationObserver: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  structuredClone: 'readonly',
};

// 서드파티 SDK/CDN 전역 (런타임 로드).
const vendorGlobals = {
  firebase: 'readonly',
  kakao: 'readonly',
  Kakao: 'readonly',
  html2canvas: 'readonly',
  qrcode: 'readonly',
  daum: 'readonly',
};

// 앱 내부 window.* 전역 함수는 파일 간 자유롭게 참조되므로,
// no-undef 오탐을 막기 위해 전역 통신 심볼을 writable 로 둔다.
const appGlobals = { t: 'readonly' };

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'functions/node_modules/**',
      'functions/index.js', // 배포 코드 — Phase 3에서 lint 편입 검토
      '.old/**',
      'scripts/**',
      '**/*.min.js',
      'test.html',
      'test_new.html',
    ],
  },

  // Cloud Functions 순수 모듈 (Node CommonJS)
  {
    files: ['functions/lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        console: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
    },
  },

  // 브라우저 클래식 스크립트 (js/)
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...vendorGlobals, ...appGlobals },
    },
    rules: {
      ...js.configs.recommended.rules,
      // classic script + window.* 전역 통신 특성상 오탐이 많은 규칙은 완화.
      'no-unused-vars': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      // 이 코드베이스는 var/function 클래식 스크립트를 의도적으로 사용(CLAUDE.md).
      // 형제 for 루프의 `var i` 재선언은 관용적이며 버그가 아님 → 끔.
      'no-redeclare': 'off',
      // 파일명 sanitizer가 제어문자 범위(\x00-\x1f)를 의도적으로 제거 → 끔.
      'no-control-regex': 'off',
      // 진짜 버그 클래스는 error 유지 (recommended 기본):
      // no-undef, no-dupe-keys, no-dupe-args, no-unreachable,
      // no-const-assign, no-func-assign, no-import-assign, use-isnan ...
    },
  },

  // Node 테스트 러너 (tests/)
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        Blob: 'readonly',
        Uint8Array: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
    },
  },
];
