# 지도 시스템 (Map)

## 개요
Kakao Maps SDK 기반 지도에 동호회 마커, 클러스터러, 급구 티커, 바텀시트 상세를 표시한다.
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
| `initUrgentTicker()` | club-detail | 급구 팀 티커 자동 롤링 (3초 간격). **마감이 이른 순**(기한 없는 예전 급구는 맨 뒤), 항목마다 마감 표시. 다시 불러도 목록·타이머를 새로 짠다, 급구가 없으면 숨김 |
| `openUrgentForm(club)` | club-detail | 급구 올리기/수정 폼 — 운동 칩(다가오는 3개) + '다른 날', 문구 60자. 올리기는 `postUrgent`(callable)로만. 새로 올리기는 인증된 팀 관리자만 |
| `closeClubUrgent(club)` | club-detail | 급구 내리기 — 직접 쓰기(`is_urgent:false, urgent_msg:''`, 기한·시각 삭제). 인증이 풀린 팀도 된다 |
| `toggleClubRecruiting(club)` | club-detail | 회원 모집 켜기(문구 선택 + `recruit_at` 서버 시각)/끄기. 관리자면 인증 여부 상관없이 |
| `isUrgentActive(club, nowMs?)` | dom-utils | 급구 판정 하나: `is_urgent === true` · `urgent_msg` 가 비지 않음 · `urgent_until` 이 없거나 지나지 않음. 마커·라벨·티커·배너·필터가 모두 이걸 쓴다(`functions/lib/pure.js` 와 같은 판정) |
| `urgentNextSessions` · `urgentDeadlineLabel` · `urgentMsgProblem` | urgent | 순수 계산(화면 안 만짐) — 운동 칩, 마감 글자, 문구 검사. `tests/urgent.test.js` |

## 마커 구조
각 마커 항목: `{ marker, overlay(CustomOverlay 라벨), circle(대략 위치 원, 있으면), club, urgent, isVisible }`
- 급구 마커: 지도에 직접 표시 (`setMap`), zIndex 9999 — 클러스터 밖이라 `clearClubMarkers()` 로만 지워진다
- 일반 마커: `MarkerClusterer`로 관리
- 인증 팀: 라벨에 파란 체크 배지 표시

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

## 회원 모집 중
급구와 따로 있는 평범한 깃발(`is_recruiting` · `recruit_msg` ≤60 · `recruit_at`). 팀 관리자가
인증 여부와 상관없이 직접 켜고 끈다(callable 없음). 켤 때·문구를 바꿀 때 `recruit_at` 은 서버
시각(규칙이 강제). `max(recruit_at, last_verified_at)` 가 60일을 넘으면 정리가 끈다 — 팀 정보를
고치면(수정 폼 저장 = `last_verified_at` 갱신) 다시 60일. `recruit_at` 이 없는 값(콘솔에서 켠
것)은 바로 끄지 않고 지금 시각을 붙인 뒤 그때부터 센다. 앞날짜가 박힌 값은 기준으로 안 쓴다.

## 급구 티커
- 화면 상단 롤링 배너, 급구 클럽 목록 순환 표시 — 마감이 이른 순
- `[팀 이름] 오늘 21:00까지 문구` — 마감은 이름 바로 뒤라 문구가 말줄임돼도 보인다
- 클릭 시 해당 클럽 상세 열기
- 첫 항목 복제(clone)로 무한 루프 효과

## 데이터 흐름
1. `data.js` -> `window.allClubs` 로드
2. `initMarkers()` -> 마커 + 오버레이 생성 -> 클러스터러 등록
3. 마커/라벨 클릭 -> `openClubDetail()` -> 바텀시트 PEEK 상태
4. 드래그로 EXPANDED 전환 시 풀 타임테이블 표시

## 관련 파일
- `js/map-core.js` - 지도 초기화, 마커, 클러스터러
- `js/club-detail.js` - 바텀시트, 타임테이블, 급구 티커/폼, 회원 모집 토글
- `js/urgent.js` - 급구 순수 계산(운동 칩·마감·문구 검사·티커 순서)
- `functions/index.js` `postUrgent` · `sweepClubFlags` / `functions/lib/pure.js` - 서버 판정
- `js/filters.js` - 마커 필터링 (`applyFilters`)
