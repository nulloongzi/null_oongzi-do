# 자동 검증(디버깅) 방법론 — 누룽지도 Flutter + 웹

> 상태: **방법론 문서(설계만)**. 코드·CI 착수는 후속 세션에서. Flutter 우선, 웹 병행.
> 근거: 2026-07 두 코드베이스 테스트 인프라 전수 조사(아래 "현재 상태"의 file:line은 조사 시점 기준).

## 왜 필요한가 (Context)

이번까지 앱에 수십 개 변경(게스트 모드·정합성 트랜잭션·모달 전환·카카오 공유 등)을 넣었지만 검증은 전부 **"컴파일되면 그린"** 수준이었다. 근본 원인 3가지:

1. **앱 CI가 `flutter build apk --debug`만** 한다 — `analyze`·`test`·`format` 게이트가 전혀 없다 (`.github/workflows/build-apk.yml`). 문법·타입 오류 외엔 못 잡는다.
2. **웹은 좋은 테스트(dom-utils 유닛 + Firestore/Storage 룰 에뮬레이터 테스트)를 이미 갖고도 CI가 없어 아무도 안 돌린다** (`tests/` 존재, `.github/workflows` 부재).
3. **실행 환경에 Flutter SDK가 없어**, 에이전트의 유일한 피드백이 10분짜리 컴파일-only CI다 → "푸시 → CI → 사용자가 기기에서 버그 발견" 루프.

**목표:** 기기/사람 없이 **기계가 버그를 잡는 계층형 검증 사다리(test pyramid)**. 각 변경을 그 버그를 잡을 수 있는 가장 싼 티어가 자동 검증.

## 원칙

- **피라미드**: 아래(싸고 넓음)→위(비싸고 정밀함). 매 푸시엔 하단 티어가 머지 게이팅, 상단은 스케줄/릴리즈-전.
- **버그 클래스별 최저 티어**: 타입→analyze, 로직→유닛, 시각 회귀→골든, 흐름/데이터→통합. (이번 세션에 사용자 눈으로 잡은 "리스트 vs 벤토·빠진 이모지·뒤로가기" 각각이 어느 티어에 잡히는지 매핑.)
- **기존 자산 재사용**: 웹은 `node --test` 러너·룰 테스트가 이미 있음 → 새로 짓지 말고 CI 연결+확장.

---

## Flutter 사다리 (5티어)

| 티어 | 무엇 | 도구/파일 | 현재 | 잡는 버그 | 리팩터 |
|---|---|---|---|---|---|
| **0 정적** | `flutter analyze --fatal-infos --fatal-warnings` + `dart format --set-exit-if-changed`, `analysis_options.yaml` 강화(strict-casts 등) | `analysis_options.yaml`(현재 flutter_lints만) | ❌ CI에 없음 | 미사용·타입·널·데드코드 | 없음 |
| **1 유닛** | 순수 로직 테스트 + `flutter test` CI 게이트 | `sanitize.dart`·`schedule_block.dart`·`club_filter.dart`·`schedule_parse.dart`·`i18n.dart`(price/day/schedule 변환)·`profile.dart`(기존 1개 확장)·story_card 팩토리 | 실테스트 1개(`Profile.fromMap`) | 정합성·파싱·필터 로직(감사에서 나온 캐스트·시간범위 버그) | 없음 |
| **1.5 소규모 추출** | 테스트 가능하게 순수화 | 픽업 만료 `isActive(now)`를 `DataRepository.loadPickups`서 추출 · `Club/PickupSpot`에 `fromMap`(현재 `fromDoc`은 `DocumentSnapshot`만) · `ProfileService`의 `Random` 주입 | ❌ | 만료·역직렬화·랜덤 이름 | 소 |
| **2 위젯** | 페이크로 화면 pump | `fake_cloud_firestore`+`firebase_auth_mocks`(dev_deps 추가) · **DI 시임 필요** | ❌ (DI 전무) | 셀 상태·리오더·폼 검증·게스트 게이팅·낙관적 롤백 | **중** (DI 섹션) |
| **3 골든** | 픽셀 스냅샷 | `DietGrid`(깨끗) 먼저 → 추출한 벤토셀·프로필카드·마커 라벨 pill · `StoryCardPainter`(폰트 번들+`allowRuntimeFetching=false`+고정 시계) | ❌ | 시각 회귀(리스트↔벤토, 빠진 이모지) | 소~중(추출) |
| **4 통합+에뮬** | 실기기 흐름 자동화 | `integration_test` + 안드로이드 에뮬(`reactivecircus/android-emulator-runner`) + Firebase Local Emulator(Auth/Firestore/Storage) 시드 | ❌ | 게스트→로그인 게이트, 등록→마커, 벤토 스왑 영속, 딥링크 | 대 |

### DI 시임 (티어 2의 전제 — 현재 최대 블로커)
- 서비스가 Firebase 싱글턴을 **필드로 직접** 문다: `DataRepository`(`_db = FirebaseFirestore.instance`), `LunchboxService`, `ProfileService`; **`VerificationService`는 필드도 없이 메서드 안에서 인라인**. 화면은 서비스를 필드 이니셜라이저/인라인으로 `new`. `main.dart`가 `const MapScreen()`을 시임 없이 빌드.
- **최소 침습 경로**: (a) 서비스 3종은 `_db`를 **생성자 파라미터(기본값 `FirebaseFirestore.instance`)** 로 — 기계적. (b) 화면은 서비스 홀더/생성자 주입. (c) `VerificationService`는 인라인 → 필드화 먼저.
- **대안(리팩터 회피)**: 티어 2를 건너뛰고 **에뮬레이터 통합(티어 4)** 직행 — 서비스가 Firestore를 깔끔히 캡슐화하고 있어 `useFirestoreEmulator`+`signInAnonymously`로 실동작 검증 가능.

---

## 웹 사다리 (4티어) — 대부분 "연결+확장"

| 티어 | 무엇 | 현재 |
|---|---|---|
| **0 정적** | ESLint 추가 → `eslint --max-warnings 0` (지금 `node --check` 문법만) | ❌ eslint 없음 |
| **1 유닛** | `node --test` 확장: `i18n.js` 변환(`i18nPrice/Day/Target`) 테스트, 고아 테스트(`insta-embed.test.js`·`spot-story-card.test.js`) npm 스크립트 연결, `computeExpireAt`(`pickup-host.js`)·필터 매처(`filters.js` applyFilters 인라인) 순수 추출 후 테스트 | dom-utils 유닛 ✅ / 나머지 ❌ |
| **2 룰/백엔드** | **이미 존재**(`tests/firestore-rules.test.js`·`storage-rules.test.js`, 에뮬 :8080/:9199) → CI 연결. functions 테스트 추가(현재 0), `npm test`를 순수/에뮬 분리 | 룰 테스트 ✅(미실행) / functions ❌ |
| **3 헤드리스 스모크** | Playwright: 로컬 정적서버+Firebase 에뮬(시드) 또는 배포본 로드 → **콘솔 에러 0 + 마커 렌더 + 상세 열림 + 패리티 DOM**(`renderInstaEmbeds` 더보기, `#fsKeyword`) 검증 = "한 바퀴 싹 돌리기" | ❌ |

---

## 공통: CI 배선 (가장 큰 결손)
- **두 레포 다 테스트를 CI에서 안 돌린다.** 웹 레포엔 `.github/workflows` 자체가 없음.
- **웹 `ci.yml` 신설**: `npm ci` → eslint → `node --test`(순수) → `firebase emulators:exec "node --test"`(룰) → (선택)Playwright 스모크. `push`+`pull_request`.
- **앱**: `build-apk.yml` 확장 또는 `ci.yml` 신설 — 빠른 게이트(analyze+format+test)를 빌드 앞에. `pull_request` 트리거 추가. 통합/에뮬은 별도 스케줄/릴리즈-전 잡.
- **Firebase 에뮬레이터**: `firebase.json`에 **auth 포트 추가**(현재 firestore/storage만) + 시드 픽스처.

## 메타 지렛대: 에이전트 로컬 루프
- **환경 setup 스크립트에 Flutter SDK(+Dart) 설치**를 넣어(세션마다 지속), 에이전트가 `flutter analyze && flutter test`를 **초 단위로 self-verify** → "10분 컴파일-only CI" 루프 대체. 웹은 `npm ci` 한 줄. **이게 "자동 디버깅 결과 끌어올리기"의 최대 레버.**
- (에뮬레이터/통합은 안드 에뮬이 무거워 로컬보단 CI 잡으로. analyze+유닛+골든은 에뮬 없이 헤드리스로 돈다.)

---

## 단계별 실행 순서 (후속 착수 시)
- **Phase 1 (며칠, 리팩터 0, 최대 ROI)**: 앱 analyze+format+순수유닛 CI 게이트 · 웹 ESLint+유닛+기존 룰테스트 CI 연결 · 환경 setup에 Flutter SDK. → 두 레포에 "테스트 게이팅 CI" 최초 확보.
- **Phase 2 (중)**: 앱 DI 시임 → 위젯+골든(`DietGrid`+추출 서브위젯) · 웹 Playwright 스모크+functions 테스트.
- **Phase 3 (대, 릴리즈 전)**: 앱 `integration_test`+안드 에뮬 CI+Firebase 에뮬(auth 추가+시드) e2e.

## 다음 세션 시작점
- Phase 1부터. **먼저 환경 setup에 Flutter SDK를 넣어 로컬 `flutter analyze`가 도는지 확인** → 이후 CI 게이트/유닛테스트는 그 위에서 빠르게 검증. 관련 참조: 앱 `.github/workflows/build-apk.yml`, `analysis_options.yaml`, `test/widget_test.dart`(현 유일 테스트); 웹 `tests/`, `package.json`, `firebase.json`.
