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
| `initUrgentTicker()` | club-detail | 급구 팀 티커 자동 롤링 (3초 간격). 다시 불러도 목록·타이머를 새로 짠다, 급구가 없으면 숨김 |
| `toggleClubUrgentState(club)` | club-detail | 급구 켜기/끄기 — 인증된 팀의 관리자만(`canModifyClub`, 규칙 `urgentChangeOk`). 저장 뒤 마커·티커·시트를 다시 그린다 |
| `isUrgentActive(club)` | dom-utils | 급구 판정 하나: `is_urgent === true` 이고 `urgent_msg` 가 비지 않음. 마커·라벨·티커·배너가 모두 이걸 쓴다 |

## 마커 구조
각 마커 항목: `{ marker, overlay(CustomOverlay 라벨), circle(대략 위치 원, 있으면), club, urgent, isVisible }`
- 급구 마커: 지도에 직접 표시 (`setMap`), zIndex 9999 — 클러스터 밖이라 `clearClubMarkers()` 로만 지워진다
- 일반 마커: `MarkerClusterer`로 관리
- 인증 팀: 라벨에 파란 체크 배지 표시

## 바텀시트 (Bottom Sheet)
- 3단계 상태: `CLOSED` / `PEEK` (390px) / `EXPANDED` (90vh)
- 터치/마우스 드래그로 상태 전환
- `interpolateMorph()`: PEEK<->EXPANDED 사이 요약/상세 시간표 크로스페이드

## 급구 티커
- 화면 상단 롤링 배너, 급구 클럽 목록 순환 표시
- 클릭 시 해당 클럽 상세 열기
- 첫 항목 복제(clone)로 무한 루프 효과

## 데이터 흐름
1. `data.js` -> `window.allClubs` 로드
2. `initMarkers()` -> 마커 + 오버레이 생성 -> 클러스터러 등록
3. 마커/라벨 클릭 -> `openClubDetail()` -> 바텀시트 PEEK 상태
4. 드래그로 EXPANDED 전환 시 풀 타임테이블 표시

## 관련 파일
- `js/map-core.js` - 지도 초기화, 마커, 클러스터러
- `js/club-detail.js` - 바텀시트, 타임테이블, 급구 티커/관리
- `js/filters.js` - 마커 필터링 (`applyFilters`)
