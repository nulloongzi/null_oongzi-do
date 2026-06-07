# 01. 지도 · 마커 · 클러스터 · 급구 티커 · 내 위치

> 원본: `js/map-core.js`, `js/data.js`, 급구 티커는 `js/club-detail.js`. 시각은 [design.md §2,§3](../design.md).

## 1. 지도 초기화 (`map-core.js`)
- 초기 중심 `(37.5665, 126.9780)`(서울), Kakao **level 12**.
- 컨테이너: 풀스크린 `#map`.
- 전역: `window.map`, `window.clusterer`, `window.markers`(`[{marker, overlay, club, isVisible}]`), `window.myMarker`.

## 2. 데이터 로드 (`data.js`)
- `loadAllClubs()`: Firestore `clubs.get()` → 각 doc 에 `id` 주입, `coordinates.{lat,lng}` → top-level `lat/lng` 평탄화, `contact.{insta,link}` → `insta/link` 평탄화. 결과를 `window.allClubs = window.clubs` 에 저장 후 `refreshMarkers()` 호출. 실패 시 빈 배열.
- `findClub(id)`: ① `allClubs` 에서 문자열 비교 검색 → ② `currentProfileData.customTeams[id]` → ③ localStorage 커스텀 팀. (딥링크/북마크 표시에 사용.)

## 3. 마커 생성 (`initMarkers` / `refreshMarkers`)
각 클럽(`lat/lng` 있는 것만):
- **일반 마커**: `assets/marker_yellow.png` (size 40×53, offset (20,53)=중앙하단).
- **급구 마커**(`is_urgent`): `assets/marker_red.png`. **클러스터에 넣지 않고** 지도에 직접(`setMap(map)`), zIndex 최상(9999).
- **라벨 오버레이**(`CustomOverlay`): `buildClubLabelEl(club)` — `is_verified` 면 파란 체크 SVG, `is_urgent` 면 `🔥 ` 텍스트, 그 뒤 클럽명(텍스트 노드). 클릭 → `openClubDetail(club.id)`. 앵커 기본 (x0.5,y1), `club.angle` 있으면 x앵커 보정.
- **클러스터러** 설정: `averageCenter:true`, `minLevel:6`(level≥6에서만 클러스터 묶음 표시), 스타일 = 40px 옐로 원/검정 bold 14px.
- `refreshMarkers()` 는 **델타 업데이트**(새 클럽만 추가)로 중복 방지.

## 4. 라벨 가시성 (줌 연동) — `updateLabelVisibility()`
`zoom_changed` 이벤트에서:
```
level = map.getLevel()
showNormalLabels = (level <= 5)
showUrgentLabels = (level <= 8)
```
각 마커의 overlay 를 보이거나 숨김. (멀리 보면 라벨이 사라지고 핀/클러스터만, 가까이 가면 이름표 등장. 급구는 더 멀리서도 보임.)

## 5. 마커 클릭 → 상세
- 마커 클릭/라벨 클릭/티커 클릭/검색결과 클릭 모두 `openClubDetail(id)`(→ [02](./02-club-detail.md)).
- `triggerMarkerClick(id)`: 검색·필터 결과에서 프로그램적으로 마커 클릭 발사.

## 6. 급구 티커 (`initUrgentTicker` in `club-detail.js`)
- 대상: `is_urgent && urgent_msg` 인 클럽. **팀명 기준 중복 제거**.
- 0개면 티커 숨김(`display:none`). 1개 이상이면 표시.
- 2개 이상이면 **세로 슬라이드 캐러셀**:
  - `tickerHeight = 44px`, 매 **3000ms** 마다 `top` 을 `-(index*44)` 로 이동(transition `top 0.5s ease-in-out`).
  - 마지막 항목 도달 시: 500ms 멈춤 → transition 끄고 `top:0` 으로 점프 → 50ms 뒤 transition 복구(무한 루프 이음매 숨김).
- 각 아이템 클릭 → 해당 클럽 `openClubDetail`.
- **Flutter**: `PageView`(vertical)+타이머 또는 `AnimatedPositioned`/`Ticker`. 중복제거·3초·이음매 점프 그대로.

## 7. 내 위치 (`moveToMyLocation` in `filters.js`)
- 📍 FAB → `navigator.geolocation.getCurrentPosition`:
  - 기존 `myMarker` 제거 → 동심원 GPS 마커 생성 → `map.panTo(현재위치)`.
  - 권한 거부/미지원 → `alert('위치 정보를 사용할 수 없습니다.')`.
- **Flutter**: `geolocator` 권한 요청 → 카메라 이동 + GPS 마커. 권한 거부 시 동일 안내.

## 8. 마커 재생성 트리거
등록/수정/삭제 후 `clusterer.clear()` + 마커 초기화 + `initMarkers()` 재호출(+급구면 `initUrgentTicker()`). → [06](./06-registration.md).

## 9. 엣지 케이스
| 상황 | 처리 |
|---|---|
| 좌표 없는 클럽 | 마커 생성 스킵 |
| Firestore 미초기화/실패 | clubs 빈 배열, 마커 0 |
| 급구 마커 | 클러스터 제외 + 항상 표시 + pulse |
| 라벨 텍스트 | 항상 텍스트 노드(직접 innerHTML 금지) — Flutter `Text` |

## 10. Flutter 매핑 요약
- 지도 SDK 커스텀 마커 3종(노랑/빨강-pulse/틸은 [08](./08-pickup.md)).
- 클러스터: SDK 클러스터 또는 직접 구현, level≥6에서 묶기.
- 라벨: 줌 임계(≤5 일반 / ≤8 급구)로 표시 토글.
- 좌표 평탄화/`findClub` 우선순위 동일 구현.
