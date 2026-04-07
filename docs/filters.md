# 검색 및 필터 시스템 (Filters)

## 개요
지역, 요일, 대상 칩 필터와 키워드 검색을 조합하여 지도 마커를 필터링한다.
필터 시트는 터치/마우스 드래그로 열고 닫을 수 있다.

## 필터 카테고리

| 카테고리 | 값 예시 | 매칭 로직 |
|----------|---------|-----------|
| `region` | 서울, 경기, 충청, 전라, 경상... | 주소 prefix 매칭. 충청/전라/경상은 복수 시도 묶음 |
| `day` | 월, 화, 수, 목, 금, 토, 일 | 스케줄 텍스트에 포함 여부. "매일"은 항상 매칭 |
| `target` | 여성전용, 남성전용, 선출가능, 6인제... | 대상 문자열 포함. 특수 필터 없으면 "무관"도 매칭 |
| keyword | 팀명 또는 주소 | `name` 또는 `address` 포함 여부 |

## 주요 함수

| 함수 | 설명 |
|------|------|
| `toggleFilter(category, value, el)` | 칩 토글 (activeFilters 배열에 추가/제거) |
| `applyFilters()` | 모든 필터 조합 적용, 마커 표시/숨김 처리 |
| `resetFilters()` | 모든 필터 초기화 + 칩 UI 리셋 |
| `moveToMyLocation()` | GPS 위치로 지도 이동 + 내 위치 마커 표시 |

## 데이터 흐름
1. 칩 클릭 -> `toggleFilter()` -> `activeFilters` 업데이트
2. 적용 버튼 -> `applyFilters()` 실행
3. `window.markers` 순회하며 4가지 조건 AND 매칭
4. 매칭된 마커만 표시: 급구 마커는 직접 setMap, 일반 마커는 clusterer에 추가
5. 필터/키워드 활성 시 `setBounds`로 결과 영역에 맞춤

## 필터 시트 UI
- `filterSheet`: translateY로 슬라이드 애니메이션
- `filterHandle`: 터치/마우스 드래그 지원 (50px 이상 드래그시 닫힘)
- `filterBadge`: 활성 필터 존재 시 `.active` 클래스 추가

## 관련 파일
- `js/filters.js` - 필터 로직, GPS, 필터 시트 드래그
- `js/map-core.js` - `window.markers`, `window.clusterer`, `updateLabelVisibility()`
