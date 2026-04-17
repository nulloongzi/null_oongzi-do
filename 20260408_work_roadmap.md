# 누룽지도 v2 작업 로드맵
> 작성일: 2026-04-08

---

## 1. 완료된 작업

### Phase 0: 프로젝트 분석 및 인터뷰
- 기존 구현 기능 10개 나열 및 미션 정렬도 평가
- 핵심 미션 정의: **배구 동호회 탐색 + 스케줄 관리**
- 타겟: 모든 사용자 동등 (입문자, 유목민, 운영자)
- 공유 기능 유지 결정 (커뮤니티 확장 대비)
- PWA: Android 불필요 (플레이스토어 앱 존재), iOS만 잠재적 가치

### Phase 1: 모듈러 아키텍처 전환 (PR #4)
**브랜치:** `refactor/modular-architecture`

단일 HTML 파일(~3963줄)을 기능별 모듈로 분리:

| 파일 | 역할 |
|------|------|
| `index.html` | 슬림 HTML 셸 (구조 + script 태그) |
| `css/main.css` | 전체 CSS (~1900줄) |
| `js/firebase-init.js` | Firebase compat SDK 초기화 + window 노출 |
| `js/data.js` | allClubs, findClub(), JSON fetch + Firestore 병합 |
| `js/auth.js` | 로그인/로그아웃, onAuthStateChanged |
| `js/profile.js` | 밥 닉네임, 프로필 카드, 닉네임 편집 |
| `js/lunchbox.js` | 도시락 전체 + localStorage 폴백 (구 PR #1) |
| `js/map-core.js` | Kakao 마커, 클러스터, 오버레이 |
| `js/club-detail.js` | 바텀시트, 시간표, 긴급 티커 |
| `js/filters.js` | 검색, 필터 시트, 칩 토글 |
| `js/registration.js` | 팀 등록 모달, Map Picker (구 PR #2) |
| `js/share.js` | 공유/스크린샷 (html2canvas) |
| `js/app.js` | 초기화 오케스트레이션 |

### Phase 2: 데이터 파이프라인 정리 (구 PR #3)
| 파일 | 변경 |
|------|------|
| `pipeline/main.py` | HTML 생성 제거, JSON만 생성 |
| `pipeline/data_manager.py` | `validate_club()` 추가 + 타입힌트 |
| `pipeline/geocoder.py` | 타입힌트 추가 |
| `.github/workflows/update_data.yml` | 6시간 크론 + JSON만 커밋 |

### Phase 3: 기능 통합
- **비로그인 도시락 (구 PR #1):** localStorage 추상화 레이어, 로그인 시 Firestore 병합
- **인앱 등록 (구 PR #2):** 등록 모달, Firebase Storage 사진 업로드, Firestore clubs 컬렉션
- **사진 등록 선택사항으로 변경:** 사진 없이도 등록 가능, 업로드 실패 시 등록 계속 진행
- **Firebase Storage Rules 배포:** 로그인 사용자만 쓰기 허용

### Phase 4: 삭제된 파일
- `templates/map_template.html` → `index.html`로 대체
- `map_renderer.py` → Python HTML 생성 제거
- `.github/workflows/update_map.yml` → `update_data.yml`로 대체
- `.old/` 레거시 파일

### Phase 5: 문서화
- `docs/auth.md` — 인증 시스템
- `docs/lunchbox.md` — 도시락 북마크
- `docs/registration.md` — 팀 등록
- `docs/filters.md` — 검색/필터
- `docs/map.md` — 지도 시스템
- `CLAUDE.md` — 프로젝트 구조 업데이트

---

## 2. 현재 상태

### 브랜치
| 브랜치 | 상태 | PR |
|--------|------|-----|
| `refactor/modular-architecture` | 활성 (진행 중) | [#4](https://github.com/nulloongzi/nulloongzido_v2/pull/4) |
| `feat/localstorage-lunchbox` | 폐기 예정 (PR #4에 통합) | [#1](https://github.com/nulloongzi/nulloongzido_v2/pull/1) |
| `feat/web-registration` | 폐기 예정 (PR #4에 통합) | [#2](https://github.com/nulloongzi/nulloongzido_v2/pull/2) |
| `feat/data-pipeline` | 폐기 예정 (PR #4에 통합) | [#3](https://github.com/nulloongzi/nulloongzido_v2/pull/3) |

### 테스트 환경
- 테스트 레포: https://github.com/nulloongzi/null_oongzi-do
- 테스트 URL: GitHub Pages 도메인 `/test.html`
- Kakao API: localhost 미등록 (GitHub Pages 도메인만 등록됨)

### Firebase 설정
- Storage Rules: `club_photos/` 읽기 전체 허용, 쓰기 로그인 필수 (배포 완료)
- Firestore: `users`, `clubs` 컬렉션 사용 중

---

## 3. 앞으로의 수정 계획

### 즉시 필요 (테스트 후 버그 수정)
- [ ] GitHub Pages 테스트 후 발견되는 JS 에러 수정
- [ ] 각 JS 모듈 간 의존성/타이밍 이슈 해결
- [ ] Kakao Maps 로딩 + 마커 렌더링 정상 동작 확인
- [ ] Firebase Auth + Firestore 연동 정상 동작 확인

### 단기 (1-2주)
- [ ] PR #1, #2, #3 닫기 (PR #4에 통합 완료)
- [ ] PR #4 코드 리뷰 후 main 머지
- [ ] 루트의 구 Python 파일 삭제 (`data_manager.py`, `geocoder.py`, `main.py`, `config.py`)
- [ ] `test_new.html` 삭제
- [ ] Firestore Security Rules 배포 (clubs 컬렉션 권한 설정)
- [ ] `manifest.json` 경로 업데이트 (`start_url` 등)
- [ ] Kakao Developers에 프로덕션 도메인 등록 확인

### 중기 (1-2개월)
- [ ] 데이터 소스 전환: Google Sheets → Firestore 중심으로 점진적 이관
- [ ] 긴급모집 실시간 반영: 인증된 운영자가 앱에서 직접 급구 토글
- [ ] 등록된 팀 관리자 대시보드 (승인/거절/인증배지 부여)
- [ ] Firestore clubs에 `status` 필드 활용 ("pending" → "approved" 워크플로우)
- [ ] 오프라인 지원: Service Worker 추가 (iOS PWA 사용자 대비)

### 장기 (3개월+)
- [ ] 커뮤니티 기능 확장 (공유 기능 리디자인 시점)
- [ ] 팀 리뷰/평점 시스템
- [ ] 팀 간 매칭/교류전 기능
- [ ] 푸시 알림 (긴급모집 알림, 스케줄 변경 알림)
- [ ] 빌드 도구 도입 검토 (Vite 등 — 모듈 수 증가 시)

---

## 4. 기술 결정 기록

| 결정 | 선택 | 이유 |
|------|------|------|
| Firebase SDK | compat (전역 스코프) | 빌드 도구 없이 JS 분리 용이 |
| CSS 분리 | main.css 하나 | 번들러 없이 다중 CSS는 cascade 문제 |
| 데이터 로딩 | fetch() + Firestore 하이브리드 | 기존 파이프라인 유지 + 실시간 등록 지원 |
| 사진 업로드 | 선택사항 | 진입장벽 제거, 인증 배지는 사진 첨부 시에만 |
| 공유 기능 | 유지 | 커뮤니티 확장 시 중요 (사용자 판단) |
| PWA | 최소 유지 | Android는 플레이스토어 앱, iOS만 잠재적 가치 |
