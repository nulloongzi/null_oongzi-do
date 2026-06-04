## 프로젝트 개요
- 누룽지도: 한국 배구 동호회 찾기 지도 앱
- 기술 스택: Vanilla JS, Firebase (Auth/Firestore/Storage), Kakao Maps SDK, GitHub Pages
- 데이터: Firestore 단일 소스 (`clubs` 컬렉션). 인앱 등록 + Cloud Functions(`functions/`)로 관리
- 커밋 규칙: Conventional Commits

## 파일 구조
```
index.html          ← 메인 엔트리 (HTML 셸 + script 태그)
css/main.css        ← 전체 CSS
js/                 ← 기능별 JS 모듈
  i18n.js           ← 다국어 (KO/EN 수동 토글, data-i18n 속성 + window.t)
  firebase-init.js  ← Firebase compat SDK 초기화
  data.js           ← 데이터 로딩 (Firestore clubs 컬렉션 단일 소스)
  auth.js           ← 인증 (Google/Email)
  profile.js        ← 프로필 카드, 닉네임
  lunchbox.js       ← 도시락 (localStorage 폴백 포함)
  map-core.js       ← 카카오맵 마커/클러스터
  club-detail.js    ← 클럽 상세 바텀시트
  filters.js        ← 검색/필터
  registration.js   ← 팀 등록 (Firebase Storage)
  share.js          ← 공유/스크린샷
  app.js            ← 초기화 오케스트레이션
functions/          ← Cloud Functions (인증 알림, 카카오 챗봇, 관리 스크립트)
assets/             ← 이미지 에셋
docs/               ← 기능별 문서
```

## 주의사항
- main 브랜치 직접 push 금지
- JS는 var/function 사용 (classic script, window.* 전역 통신)
- Firebase compat SDK 사용 (ES module 아님)
- Cloud Functions(`functions/`)는 firebase-functions v2 + admin SDK (Node)
