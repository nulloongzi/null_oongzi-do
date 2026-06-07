# 06. 팀 등록/수정 · 맵피커 · 클럽 인증

> 원본: `js/registration.js`, `js/verification.js`. 시각은 [design.md §8,§9](../design.md).

## 1. 전역 상태
- `selectedCoords`: {lat,lng}|null (맵피커로 찍으면 세팅, 모달 닫을 때/주소 직접입력 시 null)
- `editingClubId`: string|null (수정 모드 판별; 제출 시작 시 즉시 캡처해 비동기 경합 방지)
- `_mpReturn`/`_mpInput`: 맵피커 복귀 오버레이/입력 필드명

## 2. 모달 열기
- `openRegistrationModal(isUrgent)`: 신규 — `editingClubId=null`, 제목 "신규 등록", 관리자 소유자필드 숨김.
- `openEditModal(club)`: 수정 — 폼 프리필, `editingClubId=club.id`, 제목/버튼 "수정 완료", 관리자면 소유자필드 표시, `schedule_raw` 로 스케줄 블록 재구성.
- `closeRegistrationModal()`: 숨김 + `editingClubId/selectedCoords` 초기화.

## 3. 스케줄 블록 UI — `addScheduleBlock(prefill, containerId)`
- 블록 = 요일 7칩(`data-day`) + 시작/끝 `<select>`(06:00–23:30, 30분 간격) + 삭제버튼.
- prefill `{days:['월','수'], start:'19:00', end:'22:00'}`(수정용), 없으면 기본 19:00~22:00.
- `getScheduleData(containerId)` → `{raw:[{day,start,end},...], text:"월 19:00~22:00, 수 ..."}`(선택 요일을 각각 펼침).

## 4. 칩 헬퍼
- `toggleRegChip(el)`: `.selected` 토글(대상 다중선택).
- `getRegTargetValue()`: 선택 대상 콤마결합 + `#regTargetNote` 기타조건.
- `setRegTargetValue(str)`: 부분일치로 칩 선택(프리필).

## 5. 제출 — `submitRegistration()` (async)
**검증 순서**:
1. 로그인 필수(`!currentUser` → `reg_login_required`).
2. 이름(≤60, 필수), 대상(필수: 칩≥1 또는 노트), 주소(≤200, 필수), 회비(≤100).
3. 인스타 핸들: 있으면 `sanitizeInstaHandle` 통과해야(아니면 `reg_insta_invalid`).
4. 링크: 있으면 `sanitizeUrl`(`#`/falsy 거부, http(s) 강제).
5. 릴스: 있으면 `sanitizeInstaPostUrl`(공개 permalink, 아니면 `insta_reel_invalid`).
6. 스케줄: `getScheduleData()`(빈 가능).
7. **좌표**: `selectedCoords` 있으면 사용, 없으면 `kakao geocoder.addressSearch(address)` → `{lat:y,lng:x}`(못 찾으면 `reg_addr_notfound`).

**수정 모드**(`editingClubId`):
- `updatePayload` = {name,target,address,coordinates,schedule,schedule_raw,price,contact{insta,link},insta_reel, 'metadata.updated_at':serverTimestamp()}.
- **관리자 소유자 재지정**: `isAdmin && regOwnerEmail` 이면 callable `adminReassignOwner({clubId,email})` → 새 `registered_by` uid 수신(함수가 Firestore 갱신). 이메일 비우면 소유자 유지.
- `clubs/{id}.update(updatePayload)`(registered_by 직접 안 씀) → 메모리 `allClubs` 갱신 → `reg_updated`.

**신규 모드**:
- 12자 ID 생성(crypto 우선) → `newClub` = {id,name,target,is_verified:false,registered_by:uid,address,coordinates,schedule,schedule_raw,price,contact,insta_reel,is_urgent:false,urgent_msg:"",metadata{created_at,updated_at,status:"approved",submitted_by}}.
- `clubs` 에 set/add → 좌표 평탄화 → `clubs/allClubs` 에 추가 → `reg_registered`.

**공통 후처리**: 마커 재생성(`clusterer.clear()`+`initMarkers()`), 급구면 `initUrgentTicker()`, `track('club_register',{mode})`, 모달 닫기/리셋, 버튼 복구.

## 6. 맵피커 — `startMapPicker(opts)` / `confirmMapPicker` / `cancelMapPicker`
- 호출 버튼: 등록은 `startMapPicker()`(`regAddress`), 픽업은 `startMapPicker({overlay:'pkModalOverlay', input:'pkAddress'})`.
- start: 복귀 정보 저장(`_mpReturn`,`_mpInput`), 현재 모달 숨기고 풀스크린 맵피커 표시(중앙 고정 핀).
- confirm: `map.getCenter()` → `selectedCoords` → **역지오코딩** `coord2Address(lng,lat)`(도로명 우선, 없으면 지번, 그것도 없으면 `reg_map_loc`) → 입력에 주소 채움 → 모달 복귀.
- cancel: 모달 복귀(좌표 변경 없음).
- **Flutter**: 지도 화면 + 중앙 고정 핀 + 확인/취소. 카카오 geocoder(주소→좌표) / coord2Address(좌표→주소). 카카오는 `x=lng, y=lat` 주의.

## 7. 클럽 인증 — `verification.js`
- 개념: 소유자가 **인증 사진** 제출 → `pending` 요청 생성 → 관리자 수동 심사(자동 인증 아님).
- `openVerificationModal(club)`: 모달(파일 input accept image/*) 생성/표시.
- `submitVerificationRequest(club)` (async):
  1. 로그인 필수, 사진 필수(`vf_login_required`/`vf_photo_required`).
  2. Storage 업로드: `verification_photos/{uid}/{club_id}_{ts}_{sanitizedFilename}` → downloadURL.
  3. `verification_requests` add: `{club_id, club_name, photo_url, requested_by, requested_at:serverTimestamp(), status:'pending', reviewed_at:null}`.
  4. (`onVerificationCreated` 트리거가 관리자 카카오 알림.)
  5. 성공 `vf_done` / 실패 `vf_error`. 버튼 처리중 비활성.
- 상세시트의 인증 상태 표시는 [02](./02-club-detail.md) §7.

## 8. Flutter 매핑 요약
- 폼 검증 규칙·길이제한·새니타이즈 동일.
- 스케줄 블록(요일 멀티칩+시간 select) ↔ `schedule_raw` 라운드트립.
- 맵피커(지도 이동→중앙 좌표→역지오코딩).
- 사진 업로드는 `firebase_storage` 동일 경로. 소유자 재지정은 callable.
