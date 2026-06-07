# 08. 픽업(Pickup) — 탭 · 데이터 · 마커 · 리스트 · 상세 · 호스트

> 원본: `js/tabs.js`, `js/pickup-data.js`, `js/pickup-ui.js`, `js/pickup-host.js`, `js/pickup-detail.js`. 시각은 [design.md §2.2,§10](../design.md).
> 픽업은 동호회(영구 팀)와 달리 **가벼운 게임 스팟**(정기/주간). 색은 **틸**. RSVP/결제 로직은 미구현(i18n 키만 존재).

## 1. 탭 전환 — `tabs.js`
- 상태 `currentTab ∈ {'clubs','pickup'}`(기본 clubs).
- `switchTab(tab)`: 같으면 no-op. 아니면 → 버튼 active 갱신 → 두 상세시트 닫기 → 마커 teardown → **chrome 토글** → 데이터/마커 재구성:
  - clubs: `initMarkers()` + `applyFilters()`.
  - pickup: `loadPickupGames().then(...)` → (탭 유지 확인 후) `renderPickupMarkers()` + `renderPickupList()`.
  - `track('switch_tab',{tab})`.
- **chrome 토글**:
  | 요소 | clubs | pickup |
  |---|---|---|
  | 📝 급구등록 FAB / ⚙️ 필터 / 🔥 티커 | 표시 | 숨김 |
  | 픽업 리스트 패널 | 숨김 | 표시 |
- `onSearchInput()`: clubs→`applyFilters()`, pickup→`renderPickupList()`.
- 언어변경 시 chrome(placeholder) 재적용.

## 2. 데이터 — `pickup-data.js`
- 컬렉션 `pickup_games`(스키마는 [00-overview §4](./00-overview.md)). 캐시 `window.pickupGames=[]`.
- `loadPickupGames()`: 전체 get → `coordinates` 평탄화 → 캐시. 실패 `[]`.
- `findPickupGame(id)`, `isPickupHost(spot)`(`currentUser && owner_uid===uid`).
- `createPickupGame(data)`: `ensureUid()`(없으면 `signInAnonymously()`) → `spotPayload()` → add → 캐시 갱신.
- `updatePickupGame(id, fields)` / `deletePickupGame(id)`: Firestore + 캐시. update 시 `updated_at` 자동.
- `toJsDate(v)`: Firestore Timestamp→Date.
- **익명 인증 핵심**: 첫 픽업 호스트는 조용히 익명 로그인. 소유권은 `owner_uid` 로만 추적(이메일/비번 없음).

## 3. 마커 + 리스트 — `pickup-ui.js`
- 마커: 틸 SVG(40×53), 라벨 `.pickup-label`(틸 테두리). `renderPickupMarkers()` 가 `pickupGames` 순회 생성, 클러스터 추가. `clearPickupMarkers()` 로 정리.
- 라벨 가시성: `map.getLevel() <= 6` 일 때만 표시(`zoom_changed`).
- `togglePkEnglishOnly(el)`: `pkEnglishOnly` 토글 + 리스트 재렌더.
- 라벨 헬퍼: `pkSportLabel(s)`(6s/9s/mixed → i18n), `pkLevelLabel(l)`(`pk_lv_*`).
- `renderPickupList()`: `#pickupListBody` 렌더. 필터 = `pkEnglishOnly`(english_ok) + 검색어(title/venue/address 부분일치). 0개면 `pk_empty`.
- 리스트 아이템: (있으면)이번주 배지 → 🗓 일정/메모 → 타이틀 → 메타칩(종목/레벨/초보환영/English/📍장소) → 게임비. 탭 시 `map.setLevel(min(getLevel(),5))` + pan + `openPickupDetail(id)`.

## 4. 상세 — `pickup-detail.js`
- `openPickupDetail(id, {silent})`: 시트(`.pickup-sheet`)에 `.open`. silent 아니면 줌/pan + `track('view_pickup',{id})`. 상태 `currentPickupId`.
- 콘텐츠: 타이틀 → 태그(종목/레벨/초보/English) → (이번주 공지) → 일정(🗓)/메모(📝) → 위치(📍 venue+address, 주소복사) → 게임비(💰) → **`💬 단톡 들어가기`**(contact_link 유효 시, `track('pickup_contact',{id,sport})`) → 공유(`openShareMenu('spot',spot)`) → 메모 → 인스타 임베드 → (호스트면) 수정/삭제.
- 삭제 `pkDelete(id)`: 호스트 확인(`pk_delete_confirm`) → `deletePickupGame` → 시트 닫고 마커/리스트 재렌더.
- 언어변경: 열려있으면 `openPickupDetail(id,{silent:true})`.

## 5. 호스트 모달 — `pickup-host.js`
- `openPickupCreateModal()`: `#pkModalOverlay`, 필드 초기화(sport='6s', level='any', 스케줄 블록 1개), 제목 `pk_create_title`.
- `openPickupEditModal(spot)`: 프리필 + `schedule_raw` 를 (start|end) 키로 그룹핑해 블록 재구성, `isPickupHost` 확인, 제목 `pk_edit_title`.
- 칩: `pkSportChips`/`pkLevelChips` 단일선택, `pkBeginnerChip`/`pkEnglishChip` 토글.
- 텍스트 필드: pkTitle/pkVenue/pkAddress/pkSchedule(schedule_text)/pkThisWeek/pkFee/pkContact/pkNotes/pkReel.
- `submitPickupGame()` (async):
  1. 제목+주소 필수(`pk_req_fields`).
  2. contact: `sanitizeUrl`(아니면 `reg_link_invalid`). reel: `sanitizeInstaPostUrl`.
  3. `getScheduleData('pkScheduleContainer')` → schedule/schedule_raw.
  4. 좌표: `selectedCoords` 또는 `geocode(address)`(카카오, `{lat:y,lng:x}`, 실패 `reg_addr_notfound`).
  5. 수정이면 `updatePickupGame` (`pk_updated`), 신규면 `createPickupGame` (`pk_created`).
  6. 모달 닫고 픽업 탭이면 재로드+재렌더. `track('pickup_create',{mode})`.

## 6. "이번주" 의미 (주의)
`this_week` 는 **날짜 스코프 아님** — 호스트가 직접 적는 텍스트(예 "이번주 토 7시 잠실"). 서버 자동만료 없음. 관리 책임은 UX(호스트가 직접 갱신). Flutter도 단순 텍스트 필드로.

## 7. Flutter 매핑 요약
- 탭 전환 = 마커/패널/chrome 원자적 스왑.
- 익명 인증으로 무로그인 호스팅.
- 동호회=옐로 / 픽업=틸 색 일관.
- 카카오 geocoder `x=lng,y=lat`.
- RSVP/결제는 현재 미구현(스키마/UI 일부 i18n 키만) — 포팅 범위에서 제외하되 확장 여지 인지.
