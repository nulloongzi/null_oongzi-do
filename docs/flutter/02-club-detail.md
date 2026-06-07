# 02. 클럽 상세 바텀시트 (시간표 · 드래그/모핑 · 관리/인증)

> 원본: `js/club-detail.js`. 시각은 [design.md §4](../design.md).

## 1. 상태 머신 (3 상태)
```
sheetState ∈ { 'CLOSED', 'PEEK', 'EXPANDED' }
PEEK_HEIGHT     = 390 (px)
EXPANDED_HEIGHT = window.innerHeight * 0.9
BUBBLE_HEIGHT   = 60
```
- 컨테이너 높이로 상태 표현. transition: `height 0.3s cubic-bezier(0.2,0.8,0.2,1)`(스냅 시), 드래그 중엔 `transition:none`(즉각 추적).
- `updateSheetState(state, animation)`: PEEK→390px, EXPANDED→90vh, CLOSED→0.

## 2. 드래그 제스처 (핸들 영역)
- start: `startY` 기록, transition off, `startHeight = 현재높이`.
- move: `deltaY = currentY - startY`; `newHeight = startHeight - deltaY`(위로 끌면 증가), `EXPANDED_HEIGHT` 로 상한. `ratio = (newHeight-PEEK)/(EXPANDED-PEEK)` 계산해 **타임모프** 갱신(아래 §3).
- end: transition 복구 후 스냅 판정:
  - `currentH > (PEEK+EXPANDED)/2` → EXPANDED
  - else `currentH < PEEK*0.8`(=312px) → CLOSED
  - else → PEEK
- `timeMorphContainer` 탭 → `toggleTimeExpand()`: PEEK면 EXPANDED, EXPANDED면 PEEK.
- **Flutter**: `DraggableScrollableSheet` 또는 커스텀 `GestureDetector`+`AnimationController`. 스냅 임계(중점/0.8×PEEK) 동일.

## 3. 타임-모프 (요약 ↔ 전체 연속 전환) — `interpolateMorph(ratio)`
시트 높이 비율(0=PEEK,1=EXPANDED)에 따라 시간 영역이 부드럽게 변형:
- `ratio > 0.8`: 전체 시간표 = `position:relative`(스크롤 가능), 컨테이너 `height:auto`.
- 아니면: 컨테이너 높이 = `BUBBLE_HEIGHT + 350*ratio`(60→410px), 전체는 `absolute`.
- `ratio < 0.5`: 요약 표시(opacity `1-ratio*2`로 페이드아웃), 전체 숨김.
- `ratio ≥ 0.5`: 요약 숨김, 전체 표시(opacity `(ratio-0.5)*2`로 페이드인).
- **Flutter**: 드래그 비율을 받아 `Opacity`/높이 보간(`Tween`/`lerpDouble`). 0.5/0.8 분기 그대로.

## 4. 스케줄 파싱 — `parseScheduleText(text)`
- 입력 예: `"월 19:00~21:00 / 수 18:30~20:30"`. `/` 로 분할.
- 시간 정규식: `(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})`.
- 각 세그먼트에서 요일(`월~일`) 포함 검사 → `scheduleMap[요일] = {startH,startM,endH,endM,text}`. `text` 는 12시간제 AM/PM 표기.
- 이 함수는 식단표([04](./04-lunchbox.md))에서도 재사용.

## 5. 시간표 렌더 — `renderTimetables(scheduleText)`
- 파싱 → 오늘 요일 판정 → min/max 시 도출(없으면 18~22 기본).
- 표시범위 `displayStart = max(6, minH-1)`, `displayEnd = min(24, maxH+1)`.
- `ROW_HEIGHT = clamp(가용높이/시간수, 25, 50)px`.
- **요약 버블**: 일정 있는 요일마다 `.st-bubble`(요일+시간). 전무하면 "일정 정보 없음" 1개.
- **전체 그리드**: 헤더(시간열 50px + 월~일, 오늘 강조) + 시간 라벨 열 + 요일 열들. 일정 블록 `.ft-event-block` 절대배치:
  - `top = (startH+startM/60 - displayStart)*ROW_HEIGHT`
  - `height = (지속시간)*ROW_HEIGHT - 2`

## 6. 상세 열기 — `openClubDetail(id, opts?)`
`opts.silent=true` 면 애널리틱스/지도이동/딥링크/상태변경 생략(언어변경 시 재렌더용).
순서:
1. `findClub(id)`(없으면 Firestore 폴백).
2. `track('view_club',{club_id,club_name})`(silent 제외).
3. 타이틀(인증뱃지+이름+인스타 아이콘, 핸들 새니타이즈).
4. 가격(`i18nPrice`), 주소(hidden), 시간표(`renderTimetables`).
5. 태그(대상 + 안전 URL 웹사이트 링크).
6. 길찾기 버튼: 카카오맵 길찾기 URL(이름,lat,lng).
7. 인스타 임베드(`renderInstaEmbed`).
8. 급구 배너(`is_urgent` 면 `🔥 urgent_msg`).
9. **관리/인증 버튼**(§7).
10. 🍱 북마크 → `bookmarkTeam(id)`, 🔗 공유 → `openShareMenu('club',club)`.
11. 딥링크: history 를 `?club=<id>` 로 replace.
12. `updateSheetState('PEEK')`(silent 아니면).
13. 지도: `setLevel(4, {animate})` + `panTo`(중심을 `offsetY = min(innerHeight*0.13, 150)` 만큼 위로 보정 — 시트에 안 가리게).

## 7. 관리/인증 버튼 (권한 기반)
- `canModifyClub(club)` = 관리자 OR `currentUser.uid === club.registered_by`.
- **급구 토글**: 권한자만. `toggleClubUrgentState` → `clubs/{id}.update({is_urgent, urgent_msg})` (urgent_msg 최대 200자).
- **인증 상태**(미인증 & 소유자): `verification_requests` 에서 `club_id==id` 최신 1건 조회 →
  - 없음 → "인증 신청"(→ [06](./06-registration.md) 인증 모달)
  - `pending` → "심사 중"
  - `rejected` → 사유 표시 + "재신청"
- **수정/삭제**: 권한자만. 수정 → `openEditModal(club)`([06](./06-registration.md)). 삭제 → 확인 후 `clubs/{id}.delete()` + 마커 재생성.

## 8. 닫기 / 언어변경
- `closeBottomSheet()`: 상태 CLOSED + 딥링크 파라미터 제거.
- `nurungji:langchange`: 열려있고 `currentClubId` 있으면 `openClubDetail(id,{silent:true})` 로 조용히 재렌더.

## 9. Flutter 매핑 요약
- 3-스냅 바텀시트 + 드래그 비율 기반 타임모프(요약 가로 칩 ↔ 주간 그리드).
- `parseScheduleText` 정규식/요일 매칭 그대로(식단표와 공유).
- 권한(canModifyClub)·인증요청 상태 조회 동일.
- 상세 열 때 지도 level 4 + 중심 위로 13%(최대150px) 보정.
