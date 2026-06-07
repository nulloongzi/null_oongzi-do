# 04. 도시락 (북마크) · 식단표

> 원본: `js/lunchbox.js`. 시각은 [design.md §6](../design.md). 저장은 비로그인=localStorage / 로그인=Firestore.

## 1. 데이터 모델
- **북마크**: 5칸 배열(`bookmarks[5]`), 각 칸 = 팀ID(string) 또는 null.
- **커스텀 팀**: `customTeams = { custom_<timestamp>: {id,name,schedule,schedule_raw,isCustom:true,target,address,lat,lng} }`.
- 저장 위치:
  - 비로그인: localStorage `nulloong_bookmarks`, `nulloong_custom_teams`.
  - 로그인: `users/{uid}/private/profile` 의 `bookmarks`, `customTeams`.

## 2. 상태(모듈)
```
isEditMode=false, isDietPlanOpen=false, selectedSlotIndex=null
localTempSlots=[null×5], localCustomTeams={}
```
오버레이 열려있는 동안엔 `tempSlots`(작업 복사본)로 편집.

## 3. 주요 함수 / 트리거
| 함수 | 트리거 | 동작 |
|---|---|---|
| `openLunchbox()` | 🍱 FAB | 오버레이 표시, 편집/식단 리셋, 유효 북마크 로드 → `renderLunchboxGrid()` |
| `closeLunchbox()` | 오버레이 바깥 탭 | 편집중이면 `saveLunchboxToDB()` 후 닫기 |
| `toggleEditMode()` | `🍽 편집` | 편집 on/off, off 시 저장 |
| `toggleDietPlan()` | `📅 식단표` | 식단 컨테이너 높이 토글(420px↔0) + `renderCombinedSchedule()` |
| `bookmarkTeam(id)` | 상세시트 🍱 | 첫 빈 칸에 추가(중복/꽉참 alert), 낙관적 UI + 저장 |
| `addCustomTeam()` | `🍙 직접추가` | 이름/시간 prompt → `custom_<ts>` 생성 → `bookmarkTeam` |
| `renderLunchboxGrid()` | 상태변화 | 5칸 렌더(편집모드 삭제버튼/스왑) |
| `renderCombinedSchedule()` | 식단 열림 | 주간 그리드에 모든 북마크 팀 일정 색별 오버레이 |

## 4. 북마크 추가 흐름 — `bookmarkTeam(teamId)`
1. 이미 있으면 `alert(lb_already)`.
2. 첫 null 칸 찾기 — 없으면 `alert(lb_full)`.
3. 해당 칸에 삽입.
4. **로그인**: `currentProfileData.bookmarks=slots` 즉시 반영(낙관적) + 프로필카드 재렌더 + 비동기 `users/{uid}/private/profile.set({bookmarks,customTeams},{merge})`(실패는 조용히 로그).
   **비로그인**: localStorage 저장.
5. 오버레이 열려있으면 `tempSlots` 갱신 + 그리드(+식단) 재렌더.
6. `alert(lb_added_team | lb_added_custom)`. (`add_bookmark` 애널리틱스.)

## 5. 편집 모드
- **두 번 탭 스왑**: 칸 A 탭(`.selected` 하이라이트) → 칸 B 탭이면 `tempSlots[A]↔[B]`, 선택 해제, 저장+재렌더.
- **삭제**: 삭제버튼 → `lb_remove_confirm` 확인 → `tempSlots[i]=null` → 재렌더.
- 편집 off 시 `saveLunchboxToDB()`(로그인=Firestore / 비로그인=localStorage).

## 6. 직접추가 — `addCustomTeam()`
- prompt 이름(`lb_add_prompt`/기본 `lb_add_default`), 시간(`lb_time_prompt`/기본).
- `newId='custom_'+Date.now()`, 객체 생성(target/address 는 i18n 기본값, lat/lng=null) → 저장 → `bookmarkTeam(newId)`.

## 7. 식단표(주간 그리드) — `renderCombinedSchedule()`
1. 각 북마크 팀ID 의 `team.schedule` 을 `parseScheduleText()`([02](./02-club-detail.md))로 파싱 → 요일별 이벤트 수집(분수 시간 `H+M/60`).
2. 전 이벤트의 min/max 시 → 표시범위 `max(6,floor(min)-1)`~`min(24,ceil(max)+1)`(없으면 18~22). `ROW_HEIGHT=max(30, 가용/시간수)`.
3. 헤더(월~일, `i18nDay`) + 시간 라벨열(`getHourLabel`) + 7요일열. 이벤트 절대배치 `top=(start-displayStart)*ROW`, `height=(end-start)*ROW`. 겹침은 10%씩 들여쓰기(최대 2).
4. **슬롯별 색**: 배경 `["#fffde7","#fff3e0","#f1f8e9","#fbe9e7","#f3e5f5"]`, 좌측보더 `["#fbc02d","#f57c00","#689f38","#d84315","#8e24aa"]`. 커스텀 팀명 앞 "🍙 ".

## 8. 슬롯 플레이스홀더(i18n 키)
빈 칸 라벨: index 0~4 = `lb_slot_rice`(밥)/`lb_slot_soup`(국)/`lb_slot_side1`/`side2`/`side3`.

## 9. 언어변경
`nurungji:langchange`: 오버레이 열려있으면 그리드+식단 재렌더. 편집버튼 텍스트 `lb_edit↔lb_done`, 식단 `lb_diet↔lb_diet_collapse`.

## 10. Flutter 매핑 요약
- 저장 추상화 레이어(로그인/비로그인 분기) → 단일 `BookmarkRepository`(SharedPreferences ↔ Firestore).
- 낙관적 UI(메모리 먼저, 비동기 쓰기 실패 무시).
- 5칸 비대칭 도시락 그리드(밥/국 큰 2 + 반찬 3) + 식단 주간 그리드 색 오버레이.
- `parseScheduleText` 공유.
