# 03. 검색 · 필터 시트 · 마커 필터링

> 원본: `js/filters.js`. 시각은 [design.md §1,§5](../design.md).

## 1. 상태
```
window.activeFilters = { region:[], day:[], target:[] }   // 각 다중선택
```
검색어는 `#topSearchInput.value`.

## 2. 칩 토글 — `toggleFilter(category, value, el)`
- `activeFilters[category]` 에 value 없으면 push + `.selected` 추가, 있으면 제거.
- 칩 그룹: region(서울/경기/인천/강원/충청/전라/경상/제주), day(월~일), target(성인/대학생/청소년/여성전용/남성전용/선출가능/6인제).

## 3. 적용 — `applyFilters()`
> 픽업 탭이면 즉시 return(클럽 마커 안 건드림).

1. 필터 뱃지: `region+day+target` 개수>0 이면 `.active`(검색바 ⚙️ 빨간점).
2. `clusterer.clear()`, bounds 초기화.
3. 각 마커에 대해 4개 매칭 AND 판정:
   - **지역**: 클럽 주소가 선택 지역으로 시작? **광역 별칭 확장** —
     - 충청 → 충남/충북/대전/세종
     - 전라 → 전남/전북/광주
     - 경상 → 경남/경북/대구/부산/울산
   - **요일**: `schedule` 에서 "요일" 글자 제거 후, "매일" 포함이면 무조건 통과, 아니면 선택 요일 중 하나라도 포함?
   - **대상**: 선택 대상 중 하나라도 `club.target` 에 포함? + **특수필터(여성전용/남성전용/선출가능/6인제)** 가 하나도 선택 안 됐으면 `target` 에 "무관" 포함 클럽도 통과.
   - **키워드**: 검색어가 `name` 또는 `address` 에 포함?
4. 통과 시 `isVisible=true`; 급구면 지도 직접표시, 일반이면 클러스터 재추가 목록에. 미통과면 마커/라벨 숨김.
5. `clusterer.addMarkers(보이는 일반마커)` + `updateLabelVisibility()`.
6. **자동 줌**: 검색어나 필터가 있고 결과 bounds 비어있지 않으면 `map.setBounds(bounds)`(결과 전체가 보이게).

## 4. 검색 입력 — `onSearchInput()`
- 입력 변화 시 호출. 탭에 따라 라우팅: clubs → `applyFilters()`, pickup → `renderPickupList()`([08](./08-pickup.md)).
- (디바운스 없음 — keyup마다 즉시. Flutter에서는 짧은 디바운스 ~150ms 권장하나 동작 동일 유지.)

## 5. 초기화 — `resetFilters()`
- 모든 `activeFilters` 비움 + 칩 `.selected` 해제 + 검색입력 비움 + `applyFilters()`.

## 6. 필터 시트 열기/닫기 + 드래그
- `openFilterSheet()` → `transform: translateY(0)` (위에서 내려옴).
- `closeFilterSheet()` → `translateY(-100%)`.
- 드래그(상단→위로): `deltaY < 0` 만 허용. end에서 `deltaY < -50px` 면 닫기, 아니면 스냅 복귀. transition `0.3s cubic-bezier(0.2,0.8,0.2,1)`.
- `적용하기` 버튼은 `applyFilters()` + 닫기.

## 7. Flutter 매핑 요약
- `activeFilters` 를 `Set<String>` 3개로. 칩 토글 = 셋 add/remove + 선택 스타일.
- 매칭 로직(광역 별칭, "매일"/"무관" 특례) 그대로 — **백엔드 쿼리 아님, 클라 필터**.
- 적용 후 결과에 맞춰 카메라 `fitBounds`.
- 필터 시트는 위에서 내려오는 시트(클럽 상세와 반대 방향).
