## 프로젝트 개요
- 누룽지도: 한국 배구 동호회 찾기 지도 앱
- 기술 스택: Vanilla JS, Firebase (Auth/Firestore/Storage), Kakao Maps SDK, GitHub Pages
- 데이터: Google Sheets → Python 파이프라인 → JSON + Firestore 하이브리드
- 커밋 규칙: Conventional Commits

## 파일 구조
```
index.html          ← 메인 엔트리 (HTML 셸 + script 태그)
css/main.css        ← 전체 CSS
js/                 ← 기능별 JS 모듈
  firebase-init.js  ← Firebase compat SDK 초기화
  data.js           ← 데이터 로딩 (JSON fetch + Firestore 병합)
  auth.js           ← 인증 (Google/Email)
  profile.js        ← 프로필 카드, 닉네임
  lunchbox.js       ← 도시락 (localStorage 폴백 포함)
  map-core.js       ← 카카오맵 마커/클러스터
  club-detail.js    ← 클럽 상세 바텀시트
  filters.js        ← 검색/필터
  registration.js   ← 팀 등록 (Firebase Storage)
  share.js          ← 공유/스크린샷
  app.js            ← 초기화 오케스트레이션
data/               ← 정적 JSON 데이터
pipeline/           ← Python 데이터 파이프라인
assets/             ← 이미지 에셋
docs/               ← 기능별 문서
```

## 주의사항
- main 브랜치 직접 push 금지
- 모든 함수에 타입 명시 (Python)
- JS는 var/function 사용 (classic script, window.* 전역 통신)
- Firebase compat SDK 사용 (ES module 아님)
