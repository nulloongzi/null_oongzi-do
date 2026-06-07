# Flutter 포팅 — 개요 & 공통 아키텍처

> **이 폴더의 목적**: HTML 웹앱의 **동적 동작**(상태·로직·Firestore·비동기 흐름)을 기능별로 정리해, Flutter(Android) 앱에서 동일하게 구현하기 위한 인수인계 문서.
> **시각 디자인**은 [`../design.md`](../design.md) 를 본다. 이 문서들은 "어떻게 움직이는가".
> 각 문서는 원본 JS 모듈(`js/*.js`)에서 추출. 수치/필드명은 그대로 쓸 것.

## 문서 색인
| 문서 | 다루는 기능 | 원본 JS |
|---|---|---|
| [01-map](./01-map.md) | 지도, 마커, 클러스터, 라벨, 급구 티커, 내 위치 | `map-core.js`, `data.js`, `club-detail.js`(ticker) |
| [02-club-detail](./02-club-detail.md) | 클럽 상세 바텀시트, 시간표, 드래그/모핑, 관리/인증 | `club-detail.js` |
| [03-filters](./03-filters.md) | 검색, 필터 시트, 칩, 마커 필터링 | `filters.js` |
| [04-lunchbox](./04-lunchbox.md) | 도시락(북마크), 식단표, 직접추가, 편집 | `lunchbox.js` |
| [05-profile-auth](./05-profile-auth.md) | 인증, 밥 닉네임, 프로필 카드, 마이그레이션 | `auth.js`, `profile.js`, `firebase-init.js` |
| [06-registration](./06-registration.md) | 팀 등록/수정, 맵피커, 사진, 클럽 인증 | `registration.js`, `verification.js` |
| [07-share](./07-share.md) | 포장하기/스토리 카드, 카카오/IG 공유, 딥링크 | `share.js`, `insta-embed.js` |
| [08-pickup](./08-pickup.md) | 픽업 탭, 픽업 데이터/마커/리스트/상세/호스트 | `pickup-*.js`, `tabs.js` |
| [09-i18n](./09-i18n.md) | 다국어, 언어 토글, 데이터 변환 | `i18n.js`, `app.js`(부트) |

---

## 1. 아키텍처 개념 (웹 → Flutter 매핑)

웹앱은 **classic script + `window.*` 전역 통신** 구조(ES module 아님). 모듈들은 `window` 에 함수/상태를 붙여 서로 호출하고, `document` 의 커스텀 이벤트 `nurungji:langchange` 로 느슨하게 통신한다.

| 웹 패턴 | Flutter 권장 대응 |
|---|---|
| `window.*` 전역 함수/상태 | 상태관리(예: Riverpod/Provider/GetX) + 서비스 클래스. 전역 가변 상태를 그대로 옮기지 말고 명시적 상태 모델로. |
| `document.addEventListener('nurungji:langchange')` | 언어 상태를 `ChangeNotifier`/Stream 으로 두고 의존 위젯 rebuild. |
| `localStorage` | `shared_preferences` (키·JSON 구조 동일 유지). |
| Firebase **compat** SDK(`window.firebase*`) | **FlutterFire**(`firebase_auth`, `cloud_firestore`, `firebase_storage`, `firebase_analytics`). 컬렉션/문서 경로·필드명 **동일**. |
| Kakao Maps JS SDK | 채택한 지도 SDK(카카오맵 Flutter 플러그인 또는 대체). 마커/클러스터/오버레이 동일 개념. |
| `alert/confirm/prompt` | `showDialog` / 커스텀 다이얼로그. |
| `setTimeout` / CSS transition | `Future.delayed` / `AnimationController`. |
| DOM innerHTML 직접 조립 | 위젯 트리. (단, XSS 새니타이즈 규칙은 §4 참고 — 외부 URL/핸들 검증은 그대로 유지.) |

---

## 2. 부트스트랩 순서 (`app.js`)

`DOMContentLoaded` 시:
1. `setupAuthListener()` — Firebase 인증 리스너 등록(아래 §3).
2. `initKakaoShare()` — 카카오 공유 SDK 초기화.
3. `loadAllClubs()` → 성공 후:
   - `initMarkers()` (지도 마커)
   - `initUrgentTicker()` (급구 티커)
   - `applyFilters()` (초기 표시)
   - `openDeepLinkClub()` / `openDeepLinkSpot()` (딥링크)
4. 도시락 오버레이 바깥 탭 → 닫기 바인딩.

**Flutter**: 스플래시/초기화 단계에서 (a) Firebase init+auth listener, (b) clubs 로드, (c) 지도 준비 후 마커/티커, (d) 앱 시작 시 딥링크(intent/URL) 파싱 순으로.

### 딥링크
- **클럽**: `?club=<id>` → `findClub(id)` → 있으면 `track('deep_link_open',{club_id})` + 상세 열기. 못 찾으면 **1회**만 1500ms 뒤 재시도(데이터 늦게 도착 대비).
- **픽업**: `?spot=<id>` → 먼저 `switchTab('pickup')`(비동기 로드 트리거) → `findPickupGame(id)` 폴링 **최대 12회 × 400ms(≈4.8s)** → 있으면 `track('deep_link_open',{spot_id})` + 상세 열기.
- **공유 URL 베이스**: `https://nulloongzi.github.io/null_oongzi-do/?club=<id>` / `?spot=<id>`.
- **Flutter**: App Links/Deep Links 로 동일 쿼리 파라미터를 받아 같은 흐름. (웹과 앱이 같은 링크를 공유하므로, 스토리 카드의 QR/URL은 웹을 가리킴 — 앱에서는 해당 URL을 가로채 앱 내 상세로 라우팅하거나, 웹으로 보내도 됨. 정책은 [07-share](./07-share.md) 참고.)

---

## 3. 인증 & 전역 상태 (요약)

- `window.currentUser` : Firebase User | null
- `window.currentProfileData` : 공개+비공개 프로필 병합 객체 | null
- `window.isAdmin` : 관리자 여부(로그인당 1회 캐시)
- `window.currentTab` : `'clubs' | 'pickup'` (기본 `'clubs'`)
- `window.currentLang` : `'ko' | 'en'`

상세는 [05-profile-auth](./05-profile-auth.md), [08-pickup](./08-pickup.md), [09-i18n](./09-i18n.md).

> **익명 인증 주의**: 픽업 호스트는 `signInAnonymously()` 로 조용히 로그인된다. 인증 리스너는 **익명 사용자를 '로그아웃 상태처럼'** 취급(프로필 UI 안 띄움)하되, 픽업 소유권은 `owner_uid` 로 추적. → [05](./05-profile-auth.md), [08](./08-pickup.md).

---

## 4. Firestore 스키마 (전체 한눈에)

> 컬렉션/필드명은 **웹과 100% 동일하게** 유지(같은 백엔드 공유). Cloud Functions(`functions/`)와 보안 규칙(`firestore.rules`)도 이 스키마 전제.

### `clubs` (동호회) — [02](./02-club-detail.md), [06](./06-registration.md)
```
id            string (12-char, 클라 생성)
name          string (≤60)
target        string (콤마 결합: "성인,대학생,6인제" + 기타조건 노트)
address       string (≤200)
coordinates   { lat:number, lng:number }   ← 로드 시 top-level lat/lng로 평탄화
schedule      string (표시용: "월 19:00~21:00 / 수 18:30~20:30")
schedule_raw  [{ day, start, end }, ...]   ← 수정 시 블록 재구성용
price         string (≤100)
contact       { insta, link }              ← 로드 시 insta/link 평탄화
insta_reel    string (공개 인스타 permalink)
is_verified   boolean
registered_by string (소유자 uid)
is_urgent     boolean
urgent_msg    string
metadata      { created_at, updated_at, status:"approved", submitted_by }
```

### `pickup_games` (픽업) — [08](./08-pickup.md)
```
id, owner_uid, title, sport('6s'|'9s'|'mixed'), level('beginner'|'intermediate'|'advanced'|'any'),
beginner_friendly:bool, english_ok:bool, venue_name, address, coordinates{lat,lng},
schedule(표시), schedule_raw[{day,start,end}], schedule_text(비정기 메모),
fee_info(텍스트만), contact_link, this_week(이번주 공지), insta_reel, notes,
created_at, updated_at
```

### `users/{uid}` (공개 프로필)
```
nickname(밥 이름 base), suffix(3자), full_nickname, color(HEX), created_at
```
### `users/{uid}/private/profile` (소유자 전용)
```
email, bookmarks(5칸 배열, 팀ID|null), customTeams({ custom_xxx: {...} })
```
### `verification_requests` (클럽 인증) — [06](./06-registration.md)
```
club_id, club_name, photo_url, requested_by, requested_at, status('pending'), reviewed_at
```
### `admins/{uid}`
존재 여부만 확인(관리자 판별).

> 보안 규칙: 공개 `users/{uid}` 문서에 `email/bookmarks/customTeams` 가 있으면 안 됨(과거 데이터는 로그인 시 lazy 마이그레이션으로 private 로 이동). → [05](./05-profile-auth.md).

### Cloud Functions (호출/트리거)
- `adminReassignOwner` (callable): 관리자가 클럽 소유자 이메일로 재지정. → [06](./06-registration.md).
- `onVerificationCreated` (트리거): 인증요청 생성 시 관리자에게 카카오 알림.

---

## 5. localStorage 키 (→ shared_preferences)
| 키 | 구조 | 의미 |
|---|---|---|
| `nulloong_bookmarks` | JSON 배열[5] (팀ID|null) | 비로그인 북마크 |
| `nulloong_custom_teams` | JSON 객체 { custom_xxx:{...} } | 비로그인 직접추가 팀 |
| `nulloong_lang` | `'ko'|'en'` | 언어 설정 |
| `nurungji_story_coach` | 존재 플래그 | 스토리 공유 1회성 안내 표시 여부 |

로그인 시 `nulloong_bookmarks`/`nulloong_custom_teams` 는 Firestore 로 병합 후 **삭제**(크로스디바이스 동기화는 Firestore가 담당). → [04](./04-lunchbox.md), [05](./05-profile-auth.md).

---

## 6. 애널리틱스 이벤트 (`window.track`)

| 이벤트 | 파라미터 | 발생 시점 |
|---|---|---|
| `view_club` | `{club_id, club_name}` | 클럽 상세 열림(silent 제외) |
| `view_pickup` | `{id}` | 픽업 상세 열림 |
| `share` | `{method, club_id|spot_id}` method=`kakao`/`web`/`copy`/`ig_story`/`story_card` | 공유 실행 |
| `deep_link_open` | `{club_id}` 또는 `{spot_id}` | 딥링크 진입 |
| `add_bookmark` / `club_register` | — / `{mode:'edit'|'create'}` | 북마크 추가 / 등록 |
| `pickup_create` | `{mode}` | 픽업 생성·수정 |
| `pickup_contact` | `{id, sport}` | 단톡 들어가기 클릭 |
| `switch_tab` | `{tab}` | 탭 전환 |
| `login` / `sign_up` | `{method:'google'|'email'}` | 로그인/가입 |

> `track` 은 애널리틱스 미초기화/광고차단 환경에서 **조용히 no-op**. Flutter도 동일하게 실패 무시.

---

## 7. 공통 새니타이즈 규칙 (`dom-utils.js`) — 그대로 유지

외부에서 들어오는 URL/핸들은 저장·표시 전 검증한다. Flutter에서도 동일 검증 함수를 둘 것:
- `sanitizeUrl(v)` → `http(s)/mailto/tel` 화이트리스트, 아니면 무효.
- `sanitizeInstaHandle(v)` → `[A-Za-z0-9._]{1,30}`.
- `sanitizeInstaPostUrl(v)` → `instagram.com/{p|reel|reels|tv}/{shortcode}` 정규화.
- `sanitizeFilename(v)` → 경로구분자 제거, 최대 80자.

(웹은 innerHTML XSS 방지가 주 목적이지만, Flutter에서도 잘못된 링크로 인한 오작동/악용 방지를 위해 **검증 통과한 값만** 저장·외부오픈한다.)
