# 보안 (Security)

## 개요
누룽지도의 보안 점검 결과·패치 진행 상황·후속 백로그를 한 곳에서 추적한다.

권한 모델 변경(팀 owner 자율 수정 + 긴급구인 토글) 직전 점검에서, 사용자 입력이 그대로 `innerHTML`로 박히는 저장형 XSS 결함과 인증·권한 룰 부족 사항이 다수 발견되어 4개 phase로 순차 패치한다.

## 위협 모델
- **저장형 XSS**: 팀 등록자가 자기 팀 필드(`name`, `urgent_msg`, `link`, `insta`, `id` 등)에 악성 페이로드를 박아두면 그 팀을 본 모든 방문자가 공격 대상이 된다.
- **권한 우회**: 클라이언트 PIN 검사·UI 버튼 숨김에만 의존하는 가짜 게이트.
- **공개 엔드포인트 남용**: 인증 없는 Cloud Function이 외부에서 임의 트리거되어 카카오톡 쿼터·Functions 비용 소진.
- **개인정보 노출**: 모든 가입자 이메일이 `users` 공개 read로 덤프 가능 (PIPA 위험).
- **Storage 임의 쓰기**: 인증된 사용자가 다른 팀 사진 경로를 덮어쓰거나 SVG에 스크립트를 박아 호스팅.

## 발견 사항

| # | 항목 | 위치 | 심각도 |
|---|------|------|--------|
| 1 | `innerHTML`에 사용자 입력 직접 삽입 (XSS) | `js/club-detail.js:251,257-264,428`, `js/map-core.js:63,125`, `js/lunchbox.js:305,469`, `js/profile.js:105` | 🔴 Critical |
| 2 | `link`/`insta` 미검증 — `javascript:` URL, 속성 깨짐 | `js/club-detail.js:250,258` | 🔴 Critical |
| 3 | 급구 토글 PIN 1234 클라이언트 체크 (가짜 보안) | `js/club-detail.js:502-536` | 🔴 Critical |
| 4 | `verificationNotify` 무인증 공개 POST | `functions/index.js:117` | 🔴 Critical |
| 5 | Storage SVG 업로드 허용 + 경로 무제한 | `storage.rules` | 🟠 High |
| 6 | `users.email` 공개 read · `admins` list 가능 | `firestore.rules:50,55` | 🟠 High |

## Phase 진행 상황

### Phase 1 — 권한 확대 가드 (XSS + URL + PIN)
권한 확대의 전제 조건. 출력단을 막아 owner가 임의 입력을 써도 다른 사용자가 공격당하지 않도록 함.

순서: **1-3 → 1-2 → 1-1** (XSS 출력단을 먼저 닫고, URL 입력단을 검증한 뒤, 마지막으로 PIN을 제거하면서 권한 확대를 안전하게 잠금 해제)

- [x] **1-3 (XSS 출력단 escape)** — 모든 `innerHTML` 사용처를 `textContent` 또는 escape 헬퍼로 통일
  - 신규 `js/dom-utils.js`에 `escapeHtml`, `sanitizeUrl`, `sanitizeInstaHandle` 추가 (`sanitizeFilename`은 Phase 3에서)
  - 적용 파일: `js/club-detail.js`(타이틀/태그/급구배너/티커/거절사유), `js/map-core.js`(CustomOverlay→HTMLElement), `js/lunchbox.js`(슬롯·주간뷰), `js/profile.js`(메인팀), `js/share.js`(세로쓰기 escape)
- [x] **1-2 (URL/insta 검증 + 등록폼 길이 가드)** — `js/registration.js`의 `submitRegistration` 진입 시 길이(name/target/address/price)·스킴(link http(s) 한정)·인스타 핸들 형식 검증
- [ ] **1-1 (PIN 제거 + canModifyClub 게이트 + rel=noopener)** — `js/club-detail.js`의 `toggleClubUrgentState` 게이트 교체, 모든 `target="_blank"`에 `rel="noopener noreferrer"` 추가
- [ ] 권한 확대 (owner 자율 수정 + 긴급구인) 활성화 — 1-1 완료 직후

### Phase 2 — `verificationNotify` 인증
- [ ] HTTP 엔드포인트 폐기 → Firestore `onDocumentCreated("verification_requests/{id}")` trigger로 마이그레이션
- [ ] `js/verification.js`의 `VERIFICATION_WEBHOOK_URL` 호출 블록 삭제
- [ ] `functions/index.js:166-167` 미정의 `approveUrl` 참조 버그 제거

### Phase 3 — Storage 룰 강화
- [ ] `storage.rules`: `verification_photos/{uid}/{file}`, `club_photos/{uid}/{file}`로 uid 격리
- [ ] contentType 화이트리스트 `image/(jpeg|png|webp|gif)` — SVG 차단
- [ ] 사이즈 한도 5MB로 하향
- [ ] `js/verification.js`의 업로드 경로에 `currentUser.uid` 포함 + `sanitizeFilename` 적용
- [ ] read는 공개 유지 (chatbot 캐러셀 thumbnail 호환)

### Phase 4 — `users` 공개/비공개 분리 + `admins` list 차단
- [ ] `users/{uid}/private/profile` 서브문서로 `email`, `bookmarks`, `customTeams` 이전
- [ ] `firestore.rules`: 서브컬렉션 본인만 read/write
- [ ] `js/auth.js`의 `loadOrCreateUserProfile`에 lazy migration 로직 추가
- [ ] `js/lunchbox.js`의 user doc update를 private path로 교체
- [ ] admin owner 재할당을 `exports.adminReassignOwner = onCall(...)` Cloud Function으로 이관 (`auth.getUserByEmail` 사용)
- [ ] `js/registration.js`의 admin 분기를 onCall 호출로 교체
- [ ] `firestore.rules`: `admins/{uid}` `allow get: if request.auth.uid == userId;`로 list 차단

## Phase 5+ 백로그
이번 패치 범위 밖. 우선순위 순.

| # | 항목 | 위치 | 메모 |
|---|------|------|------|
| 7 | Firebase **App Check** 도입 | Firestore/Storage/Functions 전체 | reCAPTCHA Enterprise(web). 자동화 봇 차단 + Functions 비용 보호 |
| 8 | Firestore rule **필드 단위 검증** | `firestore.rules` clubs update | name/target 길이, lat/lng 범위, schedule_raw 구조 |
| 9 | **CSP** 헤더 (meta) | `index.html` | inline handler가 많아 strict는 어려움. 최소 `object-src 'none'; base-uri 'self'` |
| 10 | CDN **SRI** 해시 | `index.html` script src | gstatic / jsdelivr / html2canvas |
| 11 | Cloud Functions 응답에서 raw `error.message` 제거 | `functions/index.js` 다수 | 일반화된 메시지 + 서버 로그 분리 |
| 12 | `generateId` → crypto 난수 | `js/registration.js:174` | `crypto.getRandomValues` |
| 13 | 사용자당 클럽 생성 rate limit | Cloud Function | 일 N개 제한 |

## 검증 시나리오

### XSS (Phase 1-3 완료 후)
- 팀 이름을 `<img src=x onerror=alert(1)>`로 등록 → 마커/상세시트/티커/도시락 모두 alert 안 뜸
- `urgent_msg`에 `</div><script>alert(1)</script>` → 티커에서 텍스트로만 보임

### URL (Phase 1-2 완료 후)
- `link`을 `javascript:alert(1)`로 저장 → 클릭해도 동작 없음
- `insta`를 `";onclick="alert(1)`로 저장 → 인스타 아이콘에 핸들로 인식 안 됨(저장 거부)

### PIN (Phase 1-1 완료 후)
- 비owner 계정으로 인증된 팀 진입 → `🔥 급구` 버튼 자체가 안 보임
- owner 계정 → 정상 토글, PIN 모달 사라진 상태

### Phase 2
- `curl -X POST <verificationNotify URL>` → 404 (엔드포인트 제거됨)
- 정상 인증 신청 → onCreate trigger로 카카오톡 알림 도착
- Functions 로그에서 `approveUrl is not defined` ReferenceError 사라짐

### Phase 3
- 다른 uid 경로로 업로드 시도 (devtools path 조작) → 권한 거부
- `.svg` 업로드 → contentType rule에 막힘
- 6MB 이미지 → 사이즈 룰에 막힘
- 정상 jpeg → chatbot 캐러셀 thumbnail 정상 표시

### Phase 4
- 비로그인 상태 `users.get()` → email 필드 없음
- 본인 `users/{myUid}/private/profile` get → 정상
- 타인이 동일 경로 시도 → 거부
- admin이 onCall로 owner 재할당 → 정상
- 비admin이 `admins.get()` 본인 uid → 정상, list → 거부

### 통합
- `firebase emulators:start --only firestore,storage,functions` 로 룰/함수 로컬 검증
- 배포 전 Firebase Console > Rules Playground에서 위 시나리오 재현

## 변경 이력

| 날짜 | Phase | 커밋 | 메모 |
|------|-------|------|------|
| 2026-05-07 | 점검 | — | 보안 대장 신설, Phase 1-4 계획 수립 |
| 2026-05-07 | 1-3 | 9d53927 | 저장형 XSS 차단: 모든 사용자입력 출력단을 textContent/escape로 교체, 카카오맵 오버레이 HTMLElement화 |
| 2026-05-07 | 1-2 | (이번 커밋) | 등록/수정 입력단에 길이·URL 스킴·인스타 핸들 형식 검증 추가 |

## 관련 파일
- `firestore.rules` - Firestore 보안 규칙
- `storage.rules` - Storage 보안 규칙
- `functions/index.js` - Cloud Functions
- `js/auth.js` - 인증/관리자 판별 (`canModifyClub`, `isAdmin`)
- `js/dom-utils.js` (신규) - 출력 escape 헬퍼
