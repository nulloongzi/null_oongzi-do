# 지도 시스템 (Map)

## 개요
Kakao Maps SDK 기반 지도에 동호회 마커, 클러스터러, '🍚 여기 자리 있어요?' 띠, 바텀시트 상세를 표시한다.
`map-core.js`가 지도/마커를, `club-detail.js`가 상세 UI를 담당한다.

## 지도 초기화 (map-core.js)
- 초기 중심: 서울 (37.5665, 126.9780), 줌 레벨 12
- `MarkerClusterer`: 줌 레벨 6 이상에서 클러스터링, 노란 원형 스타일
- 마커 이미지: 일반(`marker_yellow.png`), 급구(`marker_red.png`)

## 주요 함수

| 함수 | 파일 | 설명 |
|------|------|------|
| `initMarkers()` | map-core | allClubs 기반 전체 마커 생성 + 클러스터러 등록 |
| `refreshMarkers()` | map-core | 신규 클럽만 추가 (기존 마커 유지) |
| `clearClubMarkers()` | map-core | 마커·라벨·반경 원·클러스터 모두 걷기. `initMarkers()` 가 늘 먼저 부른다(다시 불러도 겹치지 않음) |
| `updateLabelVisibility()` | map-core | 줌 레벨에 따라 라벨 표시/숨김 (일반 <=5, 급구 <=8) |
| `openClubDetail(id)` | club-detail | 바텀시트 열기 + 지도 이동 |
| `renderTimetables(schedule)` | club-detail | 요약 버블 + 풀 타임테이블 렌더링 |
| `refreshThisWeek()` | this-week-ui | '여기 자리 있어요?' 띠·시트 다시 그리기. 데이터 로드·급구/식구 모집 토글·팀/픽업 삭제·등록 뒤에 부른다. 다시 불러도 타이머 하나 |
| `thisWeekItems({clubs, pickups, parseText}, nowMs)` | this-week | 순수 — 7일 안 갈 곳(게스트 급구 · 🥄 맛보기 · 픽업). `tests/this-week.test.js` |
| `openUrgentForm(club)` | club-detail | 급구 올리기/수정 폼 — 운동 칩(다가오는 3개) + '다른 날', 문구 60자. 올리기는 `postUrgent`(callable)로만. 새로 올리기는 인증된 팀 관리자만 |
| `closeClubUrgent(club)` | club-detail | 급구 내리기 — 직접 쓰기(`is_urgent:false, urgent_msg:''`, 기한·시각 삭제). 인증이 풀린 팀도 된다 |
| `openRecruitForm(club)` · `closeClubRecruiting(club)` | club-detail | 🍚 식구 모집 폼(문구 선택 + 🥄 맛보기 체크 + 60일 안내) — 켜기·수정 모두 `recruit_at` 서버 시각 / 마감은 `{is_recruiting:false}` 만. 관리자면 인증 여부 상관없이 |
| `isUrgentActive(club, nowMs?)` | dom-utils | 급구 판정 하나: `is_urgent === true` · `urgent_msg` 가 비지 않음 · `urgent_until` 이 없거나 지나지 않음. 마커·라벨·'여기 자리 있어요?'·배너·필터가 모두 이걸 쓴다(`functions/lib/pure.js` 와 같은 판정) |
| `urgentNextSessions` · `urgentDeadlineLabel` · `urgentMsgProblem` | urgent | 순수 계산(화면 안 만짐) — 운동 칩, 마감 글자, 문구 검사. `tests/urgent.test.js` |

## 마커 구조
각 마커 항목: `{ marker, overlay(CustomOverlay 라벨), circle(대략 위치 원, 있으면), club, urgent, isVisible }`
- 급구 마커: 지도에 직접 표시 (`setMap`), zIndex 9999 — 클러스터 밖이라 `clearClubMarkers()` 로만 지워진다
- 일반 마커: `MarkerClusterer`로 관리
- 인증 팀: 라벨에 파란 체크 배지 표시
- 라벨 앞 표시 `clubFlagMarks`: 🔥(게스트 급구) → 🍚(식구 모집) → 🥄(맛보기 환영), 이모지끼리 붙여 쓴다. 릴스 미리보기 제목도 같다

## 바텀시트 (Bottom Sheet)
- 3단계 상태: `CLOSED` / `PEEK` (390px) / `EXPANDED` (90vh)
- 터치/마우스 드래그로 상태 전환
- `interpolateMorph()`: PEEK<->EXPANDED 사이 요약/상세 시간표 크로스페이드

## 급구 (운동 한 번에 묶인 구인)
급구는 **운동 한 번**에 묶인다. 팀 관리자가 시간표에서 다가오는 운동(끝이 5분 뒤~7일 안,
가장 이른 3개)을 칩으로 고르거나 '다른 날'(날짜 + 끝나는 시각)을 고르면, 그 운동이 끝나는
시각이 `urgent_until` 이 된다. 지나면 화면은 바로 내려간 걸로 보고, 서버 정리가 한 시간 안에 끈다.

| 필드 | 뜻 |
|---|---|
| `is_urgent` · `urgent_msg` | 켜짐 · 문구(새 글 60자, 링크·전화번호 금지 — 연락은 팀 연락처로) |
| `urgent_until` | 고른 운동이 끝나는 시각(timestamp). 없으면 예전 급구 — 정리가 7일 기한을 붙인다 |
| `urgent_at` | 올린 시각(서버) |
| `urgent_blocked_until` | 운영자가 콘솔에서 거는 차단 기한. 이 시각 전엔 `postUrgent` 가 `blocked` 로 거절 |
| `clubs/{id}/urgent_log` | post · expire · unverified · no_admin · migrate 기록. 서버만 쓰고 운영자만 읽는다 |

- **켜기·고치기는 `postUrgent`(callable) 하나** — 규칙이 클라이언트의 급구 켜기·문구/기한 바꾸기를
  막는다. 실패 이유는 `details.reason` → 화면 `ug_err_<reason>`(모르는 이유는 `ug_err_generic`).
  검사 순서: 로그인(익명 X) → 형식 → 팀 → 관리자/운영자(`not_manager`) → `unverified` →
  `blocked` → `past`(끝 ≤ 지금+5분) → `too_far`(끝 > 지금+8일) → 문구(`msg_*`).
- **끄기는 직접 쓰기** — `{ is_urgent:false, urgent_msg:'', urgent_until: delete, urgent_at: delete }`.
- **매시간 정리 `sweepClubFlags`** — 끝난 급구(expire) · 미인증 팀(unverified) · 관리자 0명 팀
  (no_admin)을 끄고, 기한 없는 예전 급구에 7일을 붙인다(migrate). 끄기가 기한 붙이기보다 먼저.
- 마감 표시: 같은 날 `오늘 21:00까지` · 다음 날 `내일 …까지` · 그 뒤 `D-n · 목 21:00까지`(기기
  달력 날짜로 센다). 기한 없는 예전 급구는 표시 없음.

## 🍚 식구 모집 (예전 이름 '회원 모집 중')
급구와 따로 있는 평범한 깃발(`is_recruiting` · `recruit_msg` ≤60 · `recruit_at` · `recruit_drop_in`).
식구 = 같이 밥 먹는 사람 = 회원. 상세엔 배지마다 풀이 한 줄(`rc_badge_desc` · `rc_drop_in_desc`,
급구는 `ug_badge_desc`) — 밥 이름을 몰라도 읽히게.
**🥄 맛보기 환영**(`recruit_drop_in: true`) = 한 번 와서 같이 뛰어 봐도 된다(체험·게스트). 식구 모집이
켜져 있을 때만 뜬다. 모집을 끌 때는 `is_recruiting:false` 만 — 문구·맛보기는 남겨 두고 다음에 채워 쓴다. 팀 관리자가
인증 여부와 상관없이 직접 켜고 끈다(callable 없음). 켤 때·문구를 바꿀 때 `recruit_at` 은 서버
시각(규칙이 강제). `max(recruit_at, last_verified_at)` 가 60일을 넘으면 정리가 끈다 — 팀 정보를
고치면(수정 폼 저장 = `last_verified_at` 갱신) 다시 60일. `recruit_at` 이 없는 값(콘솔에서 켠
것)은 바로 끄지 않고 지금 시각을 붙인 뒤 그때부터 센다. 앞날짜가 박힌 값은 기준으로 안 쓴다.

## 🍚 여기 자리 있어요? (예전 급구 티커 자리)
7일 안에 **가서 뛸 수 있는 곳**을 시간순 한 줄로: 픽업 회차 + 게스트 급구 + 식구 모집·맛보기 팀의 회차.
(처음엔 '이번 주 차림표'라 불렀다 — 개인 시간표 '식단표'와 헷갈려 바꿨다. 키·파일은 `tw_*` · `this-week*.js`)
- **띠**: 동호회·픽업 두 탭 모두. `🍚 여기 자리 있어요? · {n}곳 ›`(n = 서로 다른 팀·크루) + 다가오는 3개를
  4초마다 한 줄씩(`수 19:00 · 이름 · 🔥 문구`). 갈 곳이 없으면 숨김. 픽업도 세려고 시작할 때 픽업 스팟을 한 번 읽는다.
- **시트**: 종류 칩(🔥 게스트 급구 · 🥄 맛보기 · 픽업, 여럿) + 날짜 칩(7일 전체 또는 하루) + 날짜별 줄.
  지금 탭의 지역·필터는 따르지 않는다(따로 보는 목록). 줄 = 시간 · 종류 · 이름 · 곳 · 문구 · '연락하기'.
  줄을 누르면 그 팀/크루 상세(필요하면 탭을 옮긴다), '연락하기'는 상세의 첫 연락과 같은 곳
  (동호회 인스타 → 홈 링크, 픽업 단톡 링크 → 인스타) + `contact_click {via:'this_week', flag}`.
- **항목 규칙**(`thisWeekItems`, 앱과 같은 계약): 창은 끝이 지금+5분 ~ 지금+7일인 회차.
  - 게스트 급구: 끝 = `urgent_until`, 시작 = 끝이 같은 회차(없으면 `~21:00`). 기한 없는 예전 급구는 뺀다.
  - 🥄 맛보기: 식구 모집 + `recruit_drop_in` + 읽히는 일정, 팀당 3회차. 급구와 같은 회차(같은 끝)는 빼고 급구만.
  - 픽업: 만료(`expire_at`) 안 된 스팟, 크루당 3회차, 문구 = `this_week`.
  - 일정은 `schedule_raw` 우선, 없으면 글자(`parseScheduleText`). 밤샘(22:00~01:00)은 다음 날 끝.

## 데이터 흐름
1. `data.js` -> `window.allClubs` 로드
2. `initMarkers()` -> 마커 + 오버레이 생성 -> 클러스터러 등록
3. 마커/라벨 클릭 -> `openClubDetail()` -> 바텀시트 PEEK 상태
4. 드래그로 EXPANDED 전환 시 풀 타임테이블 표시

## 관련 파일
- `js/map-core.js` - 지도 초기화, 마커, 클러스터러
- `js/club-detail.js` - 바텀시트, 타임테이블, 급구 폼, 식구 모집 폼
- `js/urgent.js` - 급구 순수 계산(운동 칩·마감·문구 검사)
- `js/this-week.js` · `js/this-week-ui.js` - '여기 자리 있어요?' 항목 계산(순수) · 띠와 시트
- `functions/index.js` `postUrgent` · `sweepClubFlags` / `functions/lib/pure.js` - 서버 판정
- `js/filters.js` - 마커 필터링 (`applyFilters`)
