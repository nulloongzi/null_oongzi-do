# 05. 인증 · 밥 닉네임 · 프로필 카드

> 원본: `js/auth.js`, `js/profile.js`, `js/firebase-init.js`. 시각은 [design.md §7](../design.md).

## 1. 전역 상태
- `currentUser`: Firebase User | null
- `currentProfileData`: 공개+비공개 병합 | null
- `isAdmin`: 로그인당 1회 캐시

## 2. 인증 리스너 — `setupAuthListener()` / `onAuthStateChanged`
- **익명 사용자**(`user.isAnonymous`): 로그아웃처럼 취급 — `currentProfileData=null`, `updateProfileUI(false)`. (픽업 호스팅용 익명 로그인이 프로필 UI를 켜면 안 됨.)
- **일반 로그인**: `currentUser=user` → `loadOrCreateUserProfile(user)` + `checkIsAdmin(user)` + `updateProfileUI(true)`.
- **로그아웃**: 상태 null, `updateProfileUI(false)`, 밥 워터마크 비움, 카드 배경 `#fff9c4` 리셋.

## 3. 로그인/가입 함수
| 함수 | 트리거 | 동작 |
|---|---|---|
| `loginWithGoogle()` | `구글로 간편 로그인` | Google OAuth 팝업, `track('login',{method:'google'})`. 사용자취소는 조용히 실패. |
| `loginWithEmail()` | `로그인` | `emailInput`/`pwInput` → signIn, `track('login',{method:'email'})`. |
| `registerWithEmail()` | `회원가입` | createUser, `track('sign_up',{method:'email'})`. |
| `logout()` | `로그아웃` | `au_logout_confirm` 확인 → 오버레이 닫고 signOut. |
- 에러: 이메일/비번은 Firebase 메시지 alert, 빈 입력은 `au_enter_info`.
- **UI 토글** `updateProfileUI(isLoggedIn)`: false→`#loginSection` 보임/`#profileContent` 숨김, true→반대.

## 4. 밥 닉네임 생성 — `generateRiceName()` (profile.js)
- `riceData` = 밥 종류 25종, 각 `{name, weight, color}`. 흔한 밥 6종 weight 50, 나머지 weight 10, 이스터에그 `밥아저씨` weight 1. 합계 1010.
- **가중 랜덤 추첨** → 선택 밥 + 3자리 영숫자(a–z,0–9) suffix.
- 반환: `{base:"백미밥", code:"a3x", full:"백미밥-a3x", color:"#FFF59D"}`.
- `checkDuplicateNickname(full)`: `users` 에서 `full_nickname==full` 존재 검사.

## 5. 신규 사용자 생성 — `loadOrCreateUserProfile()`
사용자 문서 없으면:
1. 유니크 밥이름: `generateRiceName()` 최대 10회 중복검사, 실패 시 타임스탬프 끝 4자리 덧붙임.
2. 공개 `users/{uid}`: `{nickname:base, suffix:code, full_nickname:full, color, created_at:new Date()}`.
3. 비공개 `users/{uid}/private/profile`: `{email, bookmarks:[], customTeams:{}}`.
4. `alert(tf('au_welcome',{name:full}))`.

## 6. 기존 사용자 + lazy 마이그레이션
- 공개/비공개 문서 로드.
- 공개 문서에 구식 필드(`email/bookmarks/customTeams`)가 있으면: 비공개로 복사 후 공개에서 `FieldValue.delete()`(보안규칙 통과 위해).
- 병합: `currentProfileData = {...공개정리본, ...비공개}`.

## 7. localStorage → Firestore 병합(로그인 시)
- `nulloong_bookmarks`/`nulloong_custom_teams` 읽어 로컬 데이터 있으면:
  - customTeams: `{...로컬, ...클라우드}`.
  - bookmarks: 클라우드 슬롯 복제 후, 로컬 ID 중 중복 아닌 것을 빈 칸에 채움.
  - Firestore `set(...,{merge:true})` → **성공 시 localStorage 키 삭제**(이후 Firestore가 동기화 소스).

## 8. 프로필 카드 렌더 — `renderProfileCard()`
| 요소 | 내용 |
|---|---|
| `#pcNickname` | `full_nickname`(없으면 `t('guest')`) |
| 카드 배경 | 밥 이름의 색(`riceData` 매칭) |
| `#pcRiceWatermark` | 밥 종류 텍스트(좌상단) |
| `#pcDate` | `가입일: YYYY.M.D`(Firestore Timestamp `seconds*1000` 또는 JS Date 모두 처리) |
| `#pcMainTeam` | 첫 non-null 북마크 → `findClub` → 일반 "🏆 ", 커스텀 "🍙 "; 없으면 `no_saved_team` |

## 9. 닉네임 편집 — `editNickname()`
- prompt(하이픈 금지 안내) → 검증(빈값/동일/하이픈 금지) → `checkDuplicateNickname` → `users/{uid}.update({full_nickname})` → 메모리 갱신 + 재렌더 + 완료 alert.

## 10. 권한 — `canModifyClub(club)` / `checkIsAdmin`
- `checkIsAdmin`: `admins/{uid}` 존재 여부 → `isAdmin` 캐시.
- `canModifyClub` = `isAdmin || club.registered_by===currentUser.uid`.

## 11. firebase-init.js (래퍼)
- compat SDK 를 `window.firebase*` 래퍼로 노출(Doc/Collection/Set/Update/Get/Query/Where/ServerTimestamp/Storage Ref/Upload/DownloadURL/Callable).
- `track(event, params)`: 애널리틱스 미초기화/차단 시 no-op.
- App Check(reCAPTCHA v3): 키 빈 문자열이라 비활성(키 채우면 활성).
- **Flutter**: FlutterFire 로 대체. 경로/필드/이벤트명만 동일하게.

## 12. Flutter 매핑 요약
- `generateRiceName` 가중표(25종, 합1010)·suffix·중복로직 그대로 → 동일 닉네임 분포.
- 익명 사용자 = 비로그인 UI 취급.
- 공개/비공개 문서 분리 + lazy 마이그레이션 + 로컬 병합 후 키 삭제.
- 카드 배경색 = 밥 색.
