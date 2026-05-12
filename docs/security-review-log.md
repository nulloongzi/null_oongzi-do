# 보안 패치 검증 로그 (Phase 1-4)

> Phase 1-4 패치(`docs/security.md` 참조)의 실제 작동을 Claude Chrome Extension으로 검증한 결과를 기록한다.
> 각 시나리오는 (1) Extension에 붙여넣을 한국어 프롬프트, (2) 기대 결과, (3) 실제 결과 칸으로 구성.
> 실제 결과는 Extension의 답변을 그대로 또는 요약해서 채우고, FAIL이면 `docs/security.md`의 해당 phase 변경 이력에 후속 커밋 SHA를 기록한다.

## 환경
- **Staging URL**: `__SET_ME__` (예: `https://nulloong-staging.web.app` 또는 `https://nulloongzido.com` if you push to prod directly)
- **검증자 계정**:
  - 일반 사용자 A: `__SET_ME__`
  - 일반 사용자 B (다른 uid, 비owner 테스트용): `__SET_ME__`
  - 관리자 계정: `__SET_ME__` (`/admins/{uid}` 등록 필요)
- **테스트 팀**:
  - "verified, A가 owner인 팀": `__SET_ME__`
  - "unverified, A가 owner인 팀": `__SET_ME__`
  - "legacy, registered_by 없는 팀": `__SET_ME__`
- **배포 커밋**: 보안 브랜치 `claude/review-security-permissions-Si0dH` HEAD (3261c8f)
- **검증 시작/종료**: `__SET_ME__` / `__SET_ME__`

> Claude Chrome Extension은 UI 조작·DOM/Console 관찰·alert 감지가 가능. devtools console에 직접 코드 실행이 필요한 시나리오는 사용자가 콘솔에 입력하고 Extension에 결과 캡처를 부탁한다.

---

## 자동 검증 결과 (Claude Code, 2026-05-12)

### 정적 분석: `/security-review` 스킬 재실행
- **결과**: ✅ PASS — Phase 1-4 변경분에서 **새로 추가된 HIGH/MEDIUM 취약점 0건**
- **요약**: 보안 패치 자체가 사전 결함(저장형 XSS, 가짜 PIN, 무인증 엔드포인트, 느슨한 Storage 룰, 공개 이메일, admins 열거)을 닫는 PR이며 새 공격면 도입 없음
- **분석 대상**: 7 커밋(8548879..ed4e134), 17개 변경 파일

### 단위 테스트: `tests/dom-utils.test.js`
- **실행**: `node --test tests/dom-utils.test.js`
- **결과**: ✅ **50/50 PASS** (duration ≈ 170ms)
- **커버 시나리오** (XSS-1/2/4, IN-2/3 대응):
  - `escapeHtml`: 5종 HTML 특수문자, `<img onerror>`, `<script>`, 속성 깨기 따옴표, null/undefined, 한글 보존, 숫자 강제 변환
  - `sanitizeUrl`: http(s)/mailto/tel 통과, `javascript:`(대소문자/공백선행), `data:`, `vbscript:`, `file:`, `ftp:`, protocol-relative, 상대경로 차단
  - `sanitizeInstaHandle`: 유효 핸들/`@` 제거/HTML 태그 거부/하이픈 거부/공백 거부/슬래시 거부/30자 경계
  - `sanitizeFilename`: 슬래시·백슬래시·콜론·제어문자 제거, 영숫자·_-. 보존, 80자 truncate(확장자 보존), 한글 _ 치환
  - **XSS payload regression matrix**: 8개 알려진 페이로드(`<svg onload>`, `<iframe javascript:>`, `<details ontoggle>` 등) 모두 escape 통과

### Firestore Rules 테스트: `tests/firestore-rules.test.js`
- **실행**: `firebase emulators:exec --only firestore "node --test tests/firestore-rules.test.js"`
- **결과**: ✅ **21/21 PASS** (PIN-3, PR-1/2/3/5 자동화 + 회귀 케이스 다수)
- **커버**:
  - Phase 1-1 (clubs update): 비owner update 거부 / owner 정상 / admin 모든 필드 / owner는 is_verified·registered_by 변경 거부
  - Phase 4 (users 분리): 공개 doc hasOnly(5필드) / 6번째 필드(`email`) 추가 시도 거부 / 본인 private read·write 통과 / 타인 private read·write 거부 / 타 uid 공개 doc write 거부
  - Phase 4 (admins): 본인 get 통과(false 반환) / list 거부 / 타인 get 거부 / write 거부(admin 본인도)
  - verification_requests 회귀: 정상 create / `requested_by` 위조 거부 / `status='approved'` 스푸핑 거부 / 클라이언트 update 거부

### Storage Rules 테스트: `tests/storage-rules.test.js`
- **실행**: `firebase emulators:exec --only storage "node --test tests/storage-rules.test.js"`
- **결과**: ✅ **20/20 PASS** (ST-1/2/3 자동화 + 추가 회귀)
- **커버**:
  - verification_photos: jpeg/png/webp/gif 통과 / svg+xml 거부 / text/html 거부 / pdf 거부 / 5MB 초과 거부 / 5MB 경계 거부 / 타 uid 경로 거부 / 비로그인 거부 / 평면 경로 write 거부 / 서브디렉터리 traversal 거부 / 레거시 평면 경로 public read 유지
  - club_photos: 본인 jpeg 통과 / 타uid 거부 / SVG 거부
  - 미정의 경로: write/read 모두 거부

### 종합
| 검증 | PASS | FAIL | 비고 |
|---|---|---|---|
| `/security-review` | ✅ | — | 새 취약점 0건 |
| dom-utils 단위 테스트 | 50 | 0 | XSS/URL/Insta/Filename |
| firestore-rules 테스트 | 21 | 0 | Phase 1-1, 4 룰 |
| storage-rules 테스트 | 20 | 0 | Phase 3 룰 |
| **합계** | **91** | **0** | |

**룰·로직 차원의 자동 검증 완료.** UI/UX·실제 카카오톡·실제 마이그레이션 흐름은 아래 수동 시나리오로 보완 필요.

---

## Phase 1-3 — 저장형 XSS

### XSS-1: 팀 이름에 onerror 페이로드
**Extension 프롬프트:**
> 누룽지도 staging 페이지에서 사용자 A로 로그인. 우하단 등록 버튼을 눌러 새 팀 등록.
> 팀 이름에 `<img src=x onerror=alert("XSS-NAME")>` 입력, 대상=성인, 주소=서울특별시 강남구, 일정 1개 추가, 등록.
> 등록 후 다음 4곳에서 alert이 뜨지 않고 텍스트 그대로 보이는지 확인하고 각각 스크린샷/요약:
> (1) 지도 마커 라벨
> (2) 마커 클릭 시 상세 바텀시트 제목
> (3) 도시락에 담아 슬롯에 표시되는 이름
> (4) 도시락 주간뷰의 이벤트 블록 제목
> 추가로 콘솔에 빨간 에러 있으면 메시지 캡처.

- **기대**: alert 발생 0회, 4곳 모두 literal text로 표시, 콘솔 에러 없음
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### XSS-2: 급구 메시지에 HTML
**Extension 프롬프트:**
> A 계정으로 verified 팀의 ⚙ → "🔥 급구 올리기" 누름. 메시지에 `<script>alert("XSS-URG")</script>` 입력 후 확인.
> 상세 시트의 급구 배너와 상단 급구 티커 양쪽에서 alert 안 뜨고 text로 보이는지 확인.

- **기대**: alert 없음, 두 곳 다 literal text
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### XSS-3: link 필드의 javascript: 스킴
**Extension 프롬프트:**
> A 계정으로 자기 팀 수정. 홈페이지 링크 칸에 `javascript:alert("XSS-LINK")` 입력 후 저장.
> 저장 단계에서 거절 메시지가 뜨는지 확인. 만약 통과되어 저장됐다면 상세 시트의 🏠 홈페이지 태그 클릭 시 alert 뜨는지 추가 확인.

- **기대**: 저장 단계에서 "http:// 또는 https://로 시작해야 합니다" 메시지로 거절 (Phase 1-2 가드)
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### XSS-4: 카카오맵 오버레이 onclick 주입
**Extension 프롬프트:**
> A 계정으로 새 팀 등록하되 팀 이름에 `'); alert("XSS-ID"); //` 입력. 등록 후 마커 라벨/지도 클러스터 풀린 상태에서 클릭.
> alert이 뜨면 FAIL. (수정 후에는 inline onclick이 제거되어 addEventListener 기반이므로 절대 alert 안 떠야 함)

- **기대**: alert 없음
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

---

## Phase 1-2 — 입력 검증

### IN-1: 길이 제한
**Extension 프롬프트:**
> 등록 폼에서 이름 칸에 한글 70자(예: "가" 70번 반복) 입력 후 등록.
> alert "팀 이름은 60자 이하" 뜨고 등록 안 되는지 확인. 같은 식으로 대상에 35자, 주소에 250자 입력해 각각 거절 메시지 확인.

- **기대**: 3건 모두 alert로 거절
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### IN-2: 인스타 핸들 형식
**Extension 프롬프트:**
> 인스타 칸에 다음을 차례로 시도하고 결과 보고:
> (a) `@valid_user.123` → 통과 (저장 후 상세 시트의 인스타 링크가 https://instagram.com/valid_user.123 로 가는지)
> (b) `<script>` → 거절 alert
> (c) `user-name` → 거절 (하이픈 미허용)
> (d) 빈칸 → 통과 (선택사항)

- **기대**: (a)(d) 통과, (b)(c) 거절
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### IN-3: 링크 스킴 화이트리스트
**Extension 프롬프트:**
> 홈페이지 링크 칸에 다음을 차례로 시도하고 결과 보고:
> (a) `https://nulloongzido.com` → 통과
> (b) `http://example.com` → 통과
> (c) `ftp://files.example.com` → 거절
> (d) `data:text/html,<script>...` → 거절
> (e) `javascript:void(0)` → 거절

- **기대**: (a)(b) 통과, (c)(d)(e) 거절
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

---

## Phase 1-1 — PIN 제거 + canModifyClub 게이트

### PIN-1: 비owner는 급구 버튼 안 보임
**Extension 프롬프트:**
> 사용자 B로 로그인(A가 owner인 verified 팀이 아닌 다른 사람의 팀). 그 팀 상세 시트를 연다.
> ⚙ 급구 버튼이 화면에 보이는지 확인 — 안 보여야 정답. 보이면 페일.

- **기대**: 급구 버튼 미노출
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PIN-2: owner는 PIN 없이 토글
**Extension 프롬프트:**
> 사용자 A로 로그인 후 자기 verified 팀 상세 → "🔥 급구 올리기" 클릭. PIN 입력 프롬프트가 나오면 FAIL (제거됐어야 함).
> 메시지 입력 모달만 떠야 정답. "테스트 급구"라고 입력 후 확인. 상태 변경되고 상세 시트에 급구 배너 표시 + 상단 티커에 등장하는지 확인. 다시 클릭해서 내리기도 동작하는지 확인.

- **기대**: PIN 프롬프트 없음, 메시지만 입력, 토글 정상
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PIN-3: 직접 Firestore 쓰기 시도 (devtools)
✅ **자동 검증으로 보장됨** (`tests/firestore-rules.test.js` — `PIN-3: 비owner는 clubs.is_urgent 업데이트 거부`)
운영 환경에서 스팟체크 권장:
**사용자 작업:** B 계정으로 로그인 상태에서 devtools 콘솔에 입력:
```js
firebase.firestore().collection('clubs').doc('<A의 팀 id>').update({is_urgent: true, urgent_msg: 'hack'})
```
**Extension 프롬프트:**
> 위 콘솔 실행 결과 출력(error: Missing or insufficient permissions 등)을 캡처해서 알려줘.

- **기대**: `permission-denied` 에러
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

---

## Phase 2 — verificationNotify 트리거

### VN-1: 기존 HTTP 엔드포인트 폐기 확인
**Extension 프롬프트:**
> 새 탭에서 `https://verificationnotify-s6piatsfbq-uc.a.run.app` 접속(POST가 아닌 GET이라 status code만 확인).
> 또는 devtools에서 `fetch('https://verificationnotify-s6piatsfbq-uc.a.run.app', {method:'POST', body:'{}'}).then(r=>r.status)` 실행 후 status code 알려줘.

- **기대**: 404 (함수 삭제됨) 또는 401/403
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____
- **메모**: 함수 삭제 전이면 이 항목은 PASS로 못 마침. 배포 시 `firebase functions:delete verificationNotify` 필수.

### VN-2: onCreate 트리거 정상 동작
**Extension 프롬프트:**
> A 계정으로 unverified 팀의 인증 신청. 사진 한 장 첨부 후 제출.
> 관리자 카카오톡 "나에게 보내기" 메시지가 도착하는지 확인 (관리자 계정에서 직접 확인 필요).
> 도착하면 PASS. 도착 안 하면 Cloud Functions 로그(`functions:log onVerificationCreated`)에서 에러 확인.

- **기대**: 카카오톡 알림 도착
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

---

## Phase 3 — Storage rules

### ST-1: SVG 업로드 차단
✅ **자동 검증으로 보장됨** (`tests/storage-rules.test.js` — `image/svg+xml 거부 (XSS 호스팅 방지)`)
운영 환경 스팟체크용 시나리오:
**Extension 프롬프트:**
> A 계정으로 인증 신청 모달 열고 파일 첨부에서 `.svg` 파일 선택(없으면 임의 SVG 텍스트를 .svg로 저장하여 사용).
> 제출 시 에러 메시지 확인. Firebase Storage 룰에 의해 차단되어야 정답.

- **기대**: 업로드 실패 (rules contentType 화이트리스트)
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### ST-2: 5MB 초과 이미지 차단
✅ **자동 검증으로 보장됨** (`tests/storage-rules.test.js` — `ST-2: 5MB 초과 jpeg 거부`)
**Extension 프롬프트:**
> 6MB 이상의 JPEG 파일을 인증 사진으로 첨부 후 제출. 5MB 한도에 막혀야 정답.

- **기대**: 업로드 실패
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### ST-3: 다른 uid 경로 쓰기 시도
✅ **자동 검증으로 보장됨** (`tests/storage-rules.test.js` — `ST-3: 다른 uid 디렉터리 쓰기 거부`)
**사용자 작업:** B 계정 로그인 상태에서 devtools 콘솔:
```js
var file = new Blob(['fake'], {type: 'image/jpeg'});
firebase.storage().ref('verification_photos/<A의 uid>/hack.jpg').put(file)
```
**Extension 프롬프트:**
> 위 콘솔 출력의 error code(아마 `storage/unauthorized`)를 알려줘.

- **기대**: `storage/unauthorized`
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### ST-4: 정상 업로드 + 챗봇 썸네일 호환
**Extension 프롬프트:**
> A 계정으로 정상 jpeg/png(1MB 정도)로 인증 신청 완료. 관리자 챗봇에서 "인증관리" 발화 → 카드에 사진 썸네일이 정상 표시되는지 확인.

- **기대**: 업로드 성공 + 챗봇 캐러셀에 사진 보임
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

---

## Phase 4 — users 공개/비공개 분리 + admins list 차단

### PR-1: 비로그인 상태에서 users 컬렉션에 email 없음
✅ **룰 차원 자동 검증** (`tests/firestore-rules.test.js` — `공개 doc에 email 필드 추가 시도 거부 (hasOnly)` 등). 단, 마이그레이션 전 데이터에 남은 email은 룰만으로 즉시 사라지지 않으니 실데이터 확인 필요.
**사용자 작업:** 시크릿 창에서 비로그인 상태로 staging 접속, devtools 콘솔:
```js
firebase.firestore().collection('users').limit(5).get().then(s => s.docs.map(d => d.data()))
```
**Extension 프롬프트:**
> 위 결과 객체에 `email` 필드가 있는지 알려줘. 닉네임/색상은 있어야 하지만 email은 없어야 정답.

- **기대**: email 필드 부재 (마이그레이션 완료된 사용자) 또는 부분적 존재 (마이그레이션 전 사용자). 결과를 그대로 기록.
- **결과**: [ ] PASS / [ ] FAIL / [ ] PARTIAL
- **관찰**: _____

### PR-2: 본인 private 서브컬렉션 읽기 가능
✅ **자동 검증으로 보장됨** (`tests/firestore-rules.test.js` — `PR-2: 본인은 private/profile read 통과`)
**사용자 작업:** A 계정 로그인 후 devtools 콘솔:
```js
firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/private/profile').get().then(d => d.data())
```
**Extension 프롬프트:**
> 위 결과에 email/bookmarks/customTeams가 있는지 알려줘.

- **기대**: 3개 필드 모두 존재
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PR-3: 타인 private 서브컬렉션 거부
✅ **자동 검증으로 보장됨** (`tests/firestore-rules.test.js` — `PR-3: 타인은 private/profile read 거부` + write 거부)
**사용자 작업:** B 계정 로그인 상태에서 devtools 콘솔:
```js
firebase.firestore().doc('users/<A의 uid>/private/profile').get().catch(e => e.code)
```
**Extension 프롬프트:**
> 결과 에러 코드 알려줘.

- **기대**: `permission-denied`
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PR-4: Lazy migration 동작
**사용자 작업:** 마이그레이션 전 옛 스키마를 가진 사용자(아직 새 코드로 로그인 안 한 사용자)로 처음 로그인.
**Extension 프롬프트:**
> 로그인 직후 devtools 콘솔에서 자신의 공개 doc과 private/profile을 차례로 조회. 결과를 알려줘:
> `firebase.firestore().doc('users/' + firebase.auth().currentUser.uid).get().then(d => d.data())`
> `firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/private/profile').get().then(d => d.data())`
> 공개 doc에는 email/bookmarks/customTeams가 없어야 하고, private에는 있어야 함.

- **기대**: 마이그레이션 후 분리 완료
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PR-5: admins list 차단
✅ **자동 검증으로 보장됨** (`tests/firestore-rules.test.js` — `PR-5: admins list 거부`, `본인 uid get 통과`, `타인 admins doc get 거부`)
**사용자 작업:** 비관리자(A) 로그인 상태에서 devtools 콘솔:
```js
firebase.firestore().collection('admins').limit(5).get().catch(e => e.code)
```
**Extension 프롬프트:**
> 에러 코드 알려줘. `permission-denied`여야 정답. 또한 자신의 uid get은 통과해야 함:
> `firebase.firestore().doc('admins/' + firebase.auth().currentUser.uid).get().then(d => d.exists)` → false (비관리자) 또는 true (관리자) 정상 반환

- **기대**: list → 거부, 본인 get → 정상
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PR-6: 관리자 owner 재할당 onCall 정상
**Extension 프롬프트:**
> 관리자 계정으로 로그인 후 임의 팀의 "팀 정보 수정" 모달 진입.
> "관리자 전용: 소유자 지정" 칸에 유효한 사용자 B의 이메일 입력 → 수정하기 버튼.
> "팀 정보가 수정되었습니다" alert이 뜨고, 다시 새로고침 후 그 팀이 사용자 B의 권한(canModifyClub)에 포함되는지 확인 (B 계정으로 로그인해 그 팀 상세시트의 ✏ 수정 버튼이 보이면 PASS).

- **기대**: 성공
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### PR-7: 비관리자가 onCall 직접 호출 시 거부
**사용자 작업:** A(비관리자) 계정에서 devtools 콘솔:
```js
firebase.functions().httpsCallable('adminReassignOwner')({clubId: 'any', email: 'a@b.c'}).catch(e => ({code: e.code, msg: e.message}))
```
**Extension 프롬프트:**
> 결과 알려줘. `permission-denied` (또는 `functions/permission-denied`)여야 정답.

- **기대**: permission-denied
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

---

## 종합 결과

| Phase | 시나리오 수 | PASS | FAIL | 처리 후속 커밋 |
|---|---|---|---|---|
| 1-3 (XSS) | 4 | _ | _ | _ |
| 1-2 (입력 검증) | 3 | _ | _ | _ |
| 1-1 (PIN) | 3 | _ | _ | _ |
| 2 (verificationNotify) | 2 | _ | _ | _ |
| 3 (Storage) | 4 | _ | _ | _ |
| 4 (Privacy) | 7 | _ | _ | _ |
| **합계** | **23** | _ | _ | _ |

## 검토 종료 시 절차
1. FAIL 항목 있으면 원인 분석 후 수정 커밋 (`security-fixup: ...`) 보안 브랜치에 추가
2. `docs/security.md` 변경 이력 마지막 줄에 "검토 완료" + 본 로그 파일 링크 + 모든 PASS 시 머지 가능 표시
3. main 머지 (PR), 운영 배포
4. 운영 배포 후 핵심 시나리오 3개(XSS-1, PIN-2, PR-1) 운영 환경에서 스팟체크 — 결과 본 로그 하단에 추가 기록

---

## 운영 배포 + 스팟체크 (자동 검증 91/91 통과 후 채택한 경로)

자동 검증으로 룰·로직 차원 검증 완료(`/security-review` + 91 unit/rules tests). Staging 별도 구성 없이 운영에 직접 deploy 후 핵심 4건만 스팟체크.

### 배포 절차 (운영자 수동 실행)

순서대로 실행. **각 단계마다 결과 확인 후 다음**:

```bash
# 1. 보안 브랜치를 main에 머지 (PR 또는 로컬 머지)
git checkout main
git pull origin main
git merge --no-ff claude/review-security-permissions-Si0dH
git push origin main

# 2. Cloud Functions 배포 (새 onVerificationCreated 트리거 + adminReassignOwner)
firebase deploy --only functions

# 3. 기존 무인증 verificationNotify HTTP 함수 삭제 (필수)
firebase functions:delete verificationNotify
# 프롬프트 확인 → "y"

# 4. Firestore 룰 + Storage 룰 동시 배포
firebase deploy --only firestore:rules,storage:rules

# 5. GitHub Pages는 main push 시 자동 재빌드 (~1-2분)
```

### 배포 후 스팟체크 4건 (운영 환경에서 직접 수행)

**S-1. 본인 로그인 + 마이그레이션 정상 동작**
- 운영 페이지에서 본인 계정 로그인
- devtools 콘솔 입력:
  ```js
  firebase.firestore().doc('users/' + firebase.auth().currentUser.uid).get().then(d => Object.keys(d.data()))
  ```
- 기대: `['nickname', 'suffix', 'full_nickname', 'color', 'created_at']` 5개 키만 (email/bookmarks/customTeams 없음)
- 추가:
  ```js
  firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/private/profile').get().then(d => Object.keys(d.data()))
  ```
  기대: `['email', 'bookmarks', 'customTeams']` 포함
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

**S-2. 본인 verified 팀의 급구 토글 (PIN 없음)**
- 본인이 owner인 verified 팀 상세 시트 진입
- ⚙ 급구 버튼 클릭. **PIN 프롬프트가 떠선 안 됨**, 메시지 입력 모달만 떠야 함
- "테스트 급구"라고 입력 → 확인 → 상세 시트 배너 + 상단 티커에 표시
- 다시 클릭 → "급구 내리기" → 정상 해제
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

**S-3. 옛 verificationNotify URL 404**
- 새 탭에서 devtools 콘솔:
  ```js
  fetch('https://verificationnotify-s6piatsfbq-uc.a.run.app', {method:'POST', body:'{}'}).then(r => r.status)
  ```
- 기대: 404 (함수 삭제됨). 200이면 `firebase functions:delete` 누락 → 즉시 삭제 필요
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

**S-4. 인증 신청 정상 동작 (onCreate 트리거)**
- unverified 팀의 owner 계정으로 인증 신청. 사진 정상 JPEG 첨부 후 제출
- 관리자 카카오톡 "나에게 보내기"로 알림 도착하는지 확인 (관리자 분께 확인 부탁)
- Firebase Console > Functions > onVerificationCreated 로그에 정상 실행 로그 확인
- **결과**: [ ] PASS / [ ] FAIL
- **관찰**: _____

### 4건 모두 PASS 시
- `docs/security.md` 변경 이력에 "운영 배포 완료 + 스팟체크 PASS" 한 줄 추가 (날짜·main 머지 커밋 SHA 포함)
- Phase 5 백로그 진행 가능 (App Check 우선 권장)

### 1건이라도 FAIL 시
- 즉시 보고. 원인 분석 후 보안 브랜치에 hotfix 커밋
- 영향이 크면 main에 revert 커밋 (`git revert -m 1 <머지 커밋>`)로 롤백

### 모니터링 권장 (1주일)
- Firebase Console > Authentication > 신규 가입 시 사용자가 nickname 편집 못 하는 에러 보고는 없는지
- Firebase Console > Functions > logs > 에러 발생률 변화 없는지
- 카카오톡 알림 양 변화 없는지 (스팸 또는 누락)

---

## Hotfix: S-1 FAIL 대응 — `migrateUsersPrivate` Cloud Function

운영 스팟체크 결과 S-1에서 `users/{uid}` public doc에 `email`/`bookmarks`/`customTeams`가 잔존 확인됨. 클라이언트 lazy migration이 휴면 사용자에게 닿지 않는 한계가 노출됨. Admin SDK 기반 일괄 마이그레이션 함수를 추가하여 보완.

### 함수 사양
- 이름: `exports.migrateUsersPrivate`
- 위치: `functions/index.js`
- 인증: `admin.auth().uid`가 `admins/{uid}` 문서에 있어야 함
- 기본 `dryRun: true` (안전). 실제 이관은 `dryRun: false` 명시
- idempotent — 이미 정리된 사용자는 무시
- 결과: `{ ok, dryRun, stats: { scanned, alreadyMigrated, needMigration, migrated, failed, errors[] } }`

### 배포 + 실행 절차

```bash
# 1. 보안 브랜치를 main에 반영 (이미 머지했다면 fetch만)
git checkout main
git pull origin main
firebase deploy --only functions:migrateUsersPrivate
```

```js
// 2. 관리자 계정으로 로그인 후 devtools 콘솔에서:
const fn = firebase.functions().httpsCallable('migrateUsersPrivate');

// dry-run으로 영향 분석
const dry = await fn({ dryRun: true });
console.log(dry.data);
// 기대: { ok: true, dryRun: true, stats: { scanned: N, needMigration: M, ... } }

// 결과 확인 후 실제 이관
const real = await fn({ dryRun: false });
console.log(real.data);
// 기대: stats.migrated == 직전 dry-run의 needMigration, failed == 0
```

### 검증
실행 후 시크릿 창에서 비로그인 상태로 devtools 콘솔:
```js
firebase.firestore().collection('users').limit(20).get()
  .then(s => s.docs.filter(d => 'email' in d.data()).length)
```
- 기대: `0` (어떤 public doc에도 email 없음)

### 후속
- 위 검증 PASS 시 S-1 PASS로 재판정 → `docs/security.md` 변경 이력에 hotfix SHA 기록
- FAIL이면 `stats.errors`의 uid + 메시지 확인하여 추가 진단
