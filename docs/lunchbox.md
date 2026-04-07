# 도시락 북마크 시스템 (Lunchbox)

## 개요
최대 5개 슬롯의 북마크 시스템. 밥/국/반찬 메타포로 구성된다.
비로그인 사용자는 localStorage, 로그인 사용자는 Firestore에 저장한다.

## 핵심 구조: 이중 저장소
- **비로그인**: `localStorage` 키 `nulloong_bookmarks` / `nulloong_custom_teams`
- **로그인**: `window.currentProfileData.bookmarks[]` + Firestore `users/{uid}`
- `getEffectiveBookmarks()`: 로그인 여부에 따라 적절한 저장소에서 읽기
- 로그인 시 localStorage 데이터가 Firestore로 자동 병합 (auth.js에서 처리)

## 주요 함수

| 함수 | 설명 |
|------|------|
| `openLunchbox()` | 도시락 오버레이 열기, tempSlots 초기화 |
| `bookmarkTeam(teamId)` | 빈 슬롯에 팀 추가 (Optimistic UI) |
| `toggleEditMode()` | 편집 모드 토글 (슬롯 교환/삭제) |
| `toggleDietPlan()` | 식단표(주간 시간표) 토글 |
| `addCustomTeam()` | 사용자 커스텀 일정 추가 (`custom_` prefix) |
| `saveLunchboxToDB()` | 편집 완료 시 저장 (Firestore 비동기 + 즉시 UI 반영) |

## 데이터 흐름
1. `openLunchbox()` -> `getEffectiveBookmarks()` -> `tempSlots`에 복사
2. 편집 모드: 슬롯 클릭으로 교환, X 버튼으로 삭제
3. 편집 완료/닫기 시: `saveLunchboxToDB()` -> Optimistic UI 적용 + Firestore 비동기 저장

## 식단표 (Diet Plan)
- `renderCombinedSchedule()`: 5개 슬롯의 스케줄을 요일별 타임테이블로 합산 표시
- 슬롯별 고유 색상으로 구분 (`slotColors`, `borderColors`)
- 겹치는 시간대는 indent 처리 (최대 3단계)

## 슬롯 구성
| 인덱스 | placeholder | 색상 |
|--------|------------|------|
| 0 | 밥 | 노랑 |
| 1 | 국 | 주황 |
| 2 | 반찬1 | 초록 |
| 3 | 반찬2 | 빨강 |
| 4 | 반찬3 | 보라 |

## 관련 파일
- `js/lunchbox.js` - 도시락 전체 로직
- `js/auth.js` - localStorage -> Firestore 병합
- `js/club-detail.js` - `parseScheduleText()`, `findClub()` 의존
