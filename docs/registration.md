# 팀 등록 시스템 (Registration)

## 개요
인앱 폼을 통해 배구 동호회를 직접 등록한다.
사진 업로드(Firebase Storage), 위치 선택(Kakao 지도 피커), Firestore 저장을 포함한다.

## 주요 함수

| 함수 | 설명 |
|------|------|
| `openRegistrationModal(isUrgent)` | 등록/급구 모달 열기 |
| `addScheduleRow()` | 스케줄 입력 행 추가 (요일 + 시작~종료 시간) |
| `getScheduleData()` | 입력된 스케줄을 `{raw, text}` 형태로 파싱 |
| `startMapPicker()` | 지도 피커 오버레이 열기 |
| `confirmMapPicker()` | 지도 중심 좌표를 주소로 역지오코딩 |
| `submitRegistration()` | 폼 검증 -> 사진 업로드 -> 지오코딩 -> Firestore 저장 |

## 데이터 흐름
1. 사용자가 폼 작성 (이름, 대상, 주소, 스케줄, 가격, SNS)
2. 사진 필수 첨부 -> Firebase Storage `club_photos/` 에 업로드
3. 주소 지오코딩: 지도 피커 좌표 우선, 없으면 Kakao `addressSearch` 사용
4. Firestore `clubs/{id}`에 문서 저장 (`status: "approved"`)
5. 프론트엔드 즉시 반영: `allClubs` 배열에 추가 + 마커 재렌더링

## Firestore 스키마 (`clubs/{id}`)
```
id, name, target, is_verified, photo_url, address, coordinates{lat, lng},
schedule, schedule_raw[], price, contact{insta, link},
is_urgent, urgent_msg, metadata{created_at, updated_at, status, submitted_by}
```

## 지도 피커
- 등록 모달을 닫고 `mapPickerOverlay`를 표시
- 지도 중심 좌표를 `selectedCoords`에 저장
- `coord2Address`로 역지오코딩하여 주소 필드 자동 입력

## 관련 파일
- `js/registration.js` - 등록 폼 및 제출 로직
- `js/firebase-init.js` - Storage 업로드 래퍼 (`firebaseUploadBytes`)
- `js/map-core.js` - 마커 재렌더링 (`initMarkers`, `clusterer`)
