# 핸드오프 — 배포 준비 & 마케팅 (다음 세션 시작점)

> 이 문서는 테스트 인프라(Phase 1~3)를 마친 세션이, **배포 준비 + 마케팅 전략** 세션으로
> 넘기기 위한 컨텍스트 요약이다. 새 세션은 이 파일부터 읽고 시작하면 된다.

## 제품 개요
- **누룽지도** — 한국 배구 동호회 찾기 지도 앱. 지역/요일/대상 필터, 픽업 게임, 도시락(찜한 팀),
  밥이름 닉네임, 카카오 공유, KO/EN 다국어.
- 데이터: Firestore 단일 소스(`clubs`/`pickup_games`). 인앱 등록 + 카카오 챗봇으로 인증/관리.

## 레포 2개
| 레포 | 스택 | 배포 |
|---|---|---|
| `nulloongzi/null_oongzi-do` (웹) | Vanilla JS + Firebase + Kakao Maps | GitHub Pages, 라이브 (nulloongzido.com) |
| `nulloongzi/null_oongzi-do-app` (앱) | Flutter 네이티브 + 네이버맵 | ⚠️ 아래 "배포 이력" 참고 |

## 배포 이력 (중요)
- **Google Play에 이미 출시돼 있음** — "누룽지도 - 배구 동호회 지도" (개발자 Nulloongzi,
  **10+ 다운로드**, 3세 이상). 단, **기존 스토어 버전은 웹뷰 앱**.
- 스토어 자산 이미 존재: 아이콘(밥그릇+배구공), 스크린샷 4장, 앱 지원 링크.
- **이번 Flutter 앱(`null_oongzi-do-app`) = 웹뷰 → 네이티브 재작성.** 즉 신규 출시가 아니라
  기존 리스팅을 **업데이트로 교체**하는 시나리오.

## 배포의 첫 갈림길 (가장 먼저 확인)
**기존 웹뷰 앱과 같은 리스팅으로 무중단 업데이트하려면** 아래가 일치해야 한다:
- **패키지명(applicationId):** 이 Flutter 앱은 `com.nulloongzi.nulloongzido`
  (`android/app/build.gradle.kts` namespace/applicationId).
  → 기존 Play Store 웹뷰 앱의 패키지명과 **동일한지 확인 필요.** 다르면 같은 리스팅 업데이트
  불가(별도 신규 앱이 됨).
- **업로드 서명 키:** 기존 앱과 같은 keystore(또는 Play App Signing 등록분)로 서명해야 함.
- **versionCode:** 현재 `pubspec.yaml` = `1.0.0+5` (versionCode 5). 다음 업로드는 스토어의
  현재 live versionCode보다 **커야** 함.

## 배포 전 기술 체크리스트 (앱)
- [ ] 패키지명/서명/ versionCode 일치 (위)
- [ ] 프로덕션 키: 네이버맵 Client ID(`lib/main.dart` `kNaverMapClientId`), 카카오 네이티브 앱키
      — 콘솔에 릴리즈 서명 키해시/패키지명 등록됐는지
- [ ] release 빌드 확인 (현 CI는 debug APK만 빌드 — `.github/workflows/build-apk.yml`)
- [ ] 스토어 리스팅 갱신: 네이티브 전환에 맞춰 스크린샷/설명 업데이트 여지
- [ ] 개인정보처리방침: 웹 레포 `privacy.md` 존재 — 최신인지 확인
- [ ] iOS도 낼지 결정(현재 android 중심; `ios/` 존재하나 App Store 이력 불명)

## 테스트/CI 상태 (방금 완료 — 안심하고 배포 가능한 근거)
Phase 1~3 완료, 두 레포 main green. 코드 변경 시 자동 게이트가 회귀를 막음.
- 웹: ESLint · 유닛 90 · Firestore/Storage 룰 55(에뮬) · Playwright 스모크 4 — push/PR 게이트
- 앱: `analyze --fatal-infos`+`format` 하드 게이트 · 테스트 68(순수+fake Firebase+골든) — push/PR 게이트
- 앱 e2e: 안드 에뮬 + Firebase 에뮬 실흐름(게스트 게이트→로그인→도시락→등록 룰) — 수동/주간 스케줄
- 부수 성과: 인증 승인 페이지 **XSS 취약점 수정**, 기존 미사용 코드 정리.

## 마케팅 프레이밍 (정정된 현실)
- **콜드 런칭 아님 → "리론치 + 초기 성장".** 이미 스토어에 있으나 10+ 다운로드라 사실상 제로베이스.
- 소구점 후보: 웹뷰→네이티브 전환으로 **"부드러운 지도·빠른 앱"**, 픽업 게임/도시락/밥이름 차별 기능,
  전국 배구 동호회를 지도 한 눈에.
- 타깃: 배구 동호회 가입 희망자, 픽업 게임 참가자. (KO 우선, EN 지원)
- 채널 아이디어(다음 세션에서 구체화): 배구 커뮤니티/카페/인스타, 동호회 총무 대상 등록 유도,
  기존 웹(nulloongzido.com)과의 유입 연계.

## 참고 파일 경로
- 앱: `lib/main.dart`(SDK 키/초기화) · `android/app/build.gradle.kts`(패키지·서명) ·
  `.github/workflows/build-apk.yml`(APK 빌드) · `pubspec.yaml`(version)
- 웹: `privacy.md` · `docs/testing-methodology.md`(테스트 사다리 근거)
