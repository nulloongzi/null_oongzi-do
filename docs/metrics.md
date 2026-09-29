# 누룽지도 — 계측 기준

> `docs/PHILOSOPHY.md`가 "무엇을 믿는가"라면, 이 문서는 "그 믿음을 **숫자로 어떻게 확인하는가**"다.
> 이벤트를 붙이거나 GA를 읽기 전에 이 문서부터. 작성: 2026-09-29 (120일치 GA 데이터 첫 분석 직후).

---

## 전제 — 앱은 1회성 창구다

대부분의 사용자는 한 번 찾고 떠난다. **그게 성공이다**(PHILOSOPHY "성공의 정의", OPEN-QUESTIONS 리프레이밍).
그래서 이 앱의 지표는 리텐션이 아니라 **통과량(throughput)** — "이번 주에 몇 명이 물꼬를 텄나"다.

- 재방문율·앱 삭제율은 **보조 지표**. 최적화 대상이 아니다.
- 포장하기(네임카드·식단표)와 팀·픽업 공유 카드는 "돌아올 이유"가 아니라
  **떠나는 사람이 다음 사람에게 건네주는 물건**으로 잰다 → 카드·링크로 **새로 들어온 사람** 수.

---

## North Star Metric

> **주당 연락한 사용자 수** — `contact_click` 또는 `get_directions` 를 한 번이라도 보낸 사람 (클럽·픽업, 웹+앱).

- **클릭 수가 아니라 사람 수.** 한 사람이 인스타·링크·길찾기를 다 눌러도 한 명이다.
- 2026-06-05 결정(주당 first-contact)과 같은 뜻이다. 한때 문서에 적혔던 "주당 길찾기 클릭 수"는 폐기 —
  길찾기는 연락의 약 5%(2026-08~09, 61일간 28건 vs `contact_click` 573건)라 신호가 너무 약하다.
- **GA에서 읽는 법**: 탐색 → 자유 형식 → 행 `주`, 필터 `이벤트 이름` 정확히 일치 `contact_click|get_directions`(정규식), 값 `총 사용자`.
- `contact_click` 은 2026-09-02, `get_directions` 는 09-09 부터 있다. 그 이전과 비교할 땐 `club_contact` + `pickup_contact` 사용자로 대신한다.
  **두 계열을 더하지 말 것** — 같은 클릭에 둘 다 발화한다(대시보드 연속성용 이중 발화).

---

## 철학 → 확인할 질문 → 이벤트

| 철학의 믿음 | 계측으로 확인할 것 | 이벤트 / 차원 |
|---|---|---|
| 물꼬 루프 (발견 → 감 잡기 → 연락) | 조회한 사람 중 연락한 비율 | `view_club`·`view_pickup` → `contact_click`·`get_directions` (사용자) |
| … → **가보기** | 실제로 갔는가 | **계측 밖.** 인터뷰·DM으로 확인 |
| 통과량 (1회성 창구) | 신규 방문자 중 연락까지 간 사람 | `first_visit`/`first_open` + NSM. 신규는 CI 오염 차단(2026-09-29) 이후 값만 믿는다 |
| 외국인·6인제 교두보 | 영어 화면 사용자 비중, 6인제·English OK 필터 사용, 영어 사용자의 연락 전환 | 사용자 속성 `ui_lang`, `lang_switch`, `filter_apply`(`six`, `english`) |
| "무슨 요일에 할 곳?" (DM의 자동화) | 요일 필터 사용 | `filter_apply`(`day`) |
| 선물하듯 공유 / 포장하기 = 건네줄 물건 | 공유 링크·카드 QR로 **새로 들어온** 사람 | 세션·첫 사용자 **소스/매체 = `share / <medium>`** (아래 UTM) |
| 릴스가 연락을 올린다 (2026-09-16 실험) | 릴스 있는 팀 vs 없는 팀의 조회 → 연락 전환 | `has_reel` (view·contact 이벤트), `reel_play` |
| 로그인 벽이 공급을 누른다 (Q1) | 등록 폼 단계별 이탈, 실제 신규 팀 수 | `registration_open` → `registration_login_gate` → `club_register`(`mode=create`). 신규 팀 수는 **Firestore `clubs` 생성일**로 센다 |
| 인스타 ↔ 앱 한 깔때기 | 인스타발 유입 | 소스/매체. 바이오·링크트리 링크에 UTM 을 붙여야 보인다(코드 밖 작업) |

---

## 이벤트 사전 (2026-09-29 추가·변경분)

| 이벤트 / 속성 | 언제 | 파라미터 | 웹 / 앱 |
|---|---|---|---|
| `filter_apply` | 동호회 필터 시트 '적용하기' | `scope:'club'`, `region`·`day`·`target`(쉼표 연결), `six`(1/0), `has_keyword`(1/0) | `filters.js` / `map_screen.dart` `_openFilter` |
| `filter_apply` | 픽업 지역·레벨·English OK 변경 | `scope:'pickup'`, `region`, `level`, `english`(1/0) | `pickup-ui.js` / `map_screen.dart` `_trackPickupFilter` |
| `lang_switch` | KO↔EN 수동 전환 | `to` | `i18n.js` `toggleLang` / `i18n.dart` `toggleLang` |
| 사용자 속성 `ui_lang` | 시작 시 + 전환 시 | `ko` \| `en` | `i18n.js` / `main.dart`·`i18n.dart` |
| `sign_up` | **소셜 첫 로그인도** (`isNewUser`) | `method` | `auth.js`·`social-auth.js` / `login_screen.dart` |

그 밖의 이벤트(조회·연락·공유·등록·밥친구 등)는 코드의 `track(` / `Track.event(` 를 grep 하면 전부 나온다.
**새 이벤트는 웹·앱이 같은 이름·같은 파라미터**로 보낸다 — 플랫폼 비교가 그걸로 된다.

## 공유 링크 출처 표시 (UTM)

건네준 링크로 들어온 사람은 GA **기본 측정기준**(세션 소스/매체, 첫 사용자 소스/매체)에 잡힌다 — 맞춤 정의 불필요.

| `utm_medium` | 어디서 | 비고 |
|---|---|---|
| `card_qr` | 팀·픽업 카드, 포장하기(네임카드·식단표)의 **QR** | 카드에 인쇄되는 주소 글자는 원래 주소 그대로 |
| `ig_story` | 인스타 스토리 공유의 링크 스티커(자동 복사)·attribution URL | |
| `kakao` | 카카오톡 공유 카드 | |
| `copy` | 링크 복사 | |
| `os_sheet` | OS 공유시트(DM 등) | |

`utm_source` 는 항상 `share`. 헬퍼: 웹 `window.withShareUtm(url, medium)` · 앱 `ShareService.withUtm(url, medium)`.
밥친구 초대 링크(`?invite=`)는 붙이지 않는다 — `deep_link_open {invite:1}` 로 따로 센다.

---

## GA 맞춤 정의 — 등록해야 보이는 것

GA 는 **맞춤 측정기준으로 등록한 파라미터만** 보고서·탐색에서 쪼갤 수 있고, **등록한 날부터만** 모인다(소급 없음).
2026-09-29 기준 등록 0개였다 → 그 전의 파라미터별 분해는 영영 볼 수 없다.

- **이벤트 범위**: `has_reel`, `source`, `channel`, `type`, `mode`, `method`, `scope`, `six`, `english`, `day`, `target`, `level`, `to`, `region`, `has_keyword`
- **사용자 범위**: `ui_lang`
- 등록 현황: 2026-09-29 에 `region`·`has_keyword` 를 뺀 14개 등록 완료(앞 6개는 그 전날). `region`·`has_keyword` 는 추가로 등록할 것.
  아직 한 번도 수집 안 된 매개변수는 GA 목록에 안 뜨니 이름을 직접 입력한다(철자는 위 표와 코드의 `track(`/`Track.event(` 그대로).
- 데이터 보관 기간: **14개월**(기본 2개월이면 탐색에서 두 달 전까지만 보인다. 표준 보고서의 집계치는 영향 없음)

---

## 오염 방지

- **웹**: `localhost`·`127.0.0.1`·`file://`·자동화 브라우저(`navigator.webdriver`)에서는 애널리틱스를 켜지 않는다(`firebase-init.js`).
  `track()` 은 그대로 안전한 no-op. 스모크 테스트가 이를 검증한다.
- **앱**: debug 빌드는 매니페스트에서 수집을 끈다(`android/app/src/debug/AndroidManifest.xml`) — e2e·캡처(debug)·사이드로드 APK.
  캡처 모드 release 빌드는 `main.dart` 에서 끈다. **DebugView 로 확인하려면** 로컬에서 그 meta-data 를 잠시 true 로.
- **2026-09-29 이전 데이터**: CI 스모크(GitHub Actions 러너)가 커밋마다 웹 신규 사용자로 잡혔다 — **GA 호스트 이름 `localhost` 로 확인**.
  9/1~29 에 14일, 합계 560명(그 기간 웹 사용자 행 합계의 약 40%), 거의 전부 새 사용자, 위치는 미국 데이터센터 도시(Phoenix·San Jose·Chicago 등).
  많은 날: 9/28 132 · 9/16 106 · 9/14 78 · 9/7 51 · 9/11 36.
  → **과거 데이터는 탐색에서 `호스트 이름` ≠ `localhost` 로 거르고 읽는다.** 사용자·신규·세션·`app_banner_*` 가 특히 부풀어 있다.
  `view_club`·연락 이벤트는 사람만 발생시키므로 오염이 거의 없다.

## 알려진 함정

- 인스타 바이오·링크 스티커 링크엔 인스타가 `utm_source=ig&utm_medium=social` 을 스스로 붙이기도 한다(9/9~11 `ig / social` 6세션). 인앱 브라우저는 리퍼러를 자주 지워서 인스타 유입의 상당수가 `(direct)` 로 보인다 — 인스타 효과는 direct 급증과 같이 읽는다.
- 소스 `club / (not set)`(9/9~11 18세션, 새 사용자 0)은 코드에 그런 UTM 이 없다. 원인 미확인 — 늘어나면 살펴볼 것.

- 앱의 `get_directions` 는 픽업 길찾기도 포함한다(`source:'pickup'`). 웹 픽업엔 길찾기가 없다. NSM(사람 수)에는 둘 다 넣는 게 맞다.
- 웹 수정 모달은 `registration_open` 을 안 보내지만 `club_register {mode:'edit'}` 는 보낸다 → 등록 전환은 `mode=create` 로만.
- 앱은 도메인 루트(`/`)만 App Link 로 연다 → 앱의 `deep_link_open` 은 밥친구 초대 말고는 거의 0 이 정상.
- 구버전 앱(`contact_click` 추가 전)은 `club_contact` 만 보낸다 → 앱에서 `club_contact` 가 조금 더 많다.

---

## 기준선 — 2026-09 첫 분석 (6/1~9/29)

| 항목 | 값 | 메모 |
|---|---|---|
| 클럽 조회(이벤트, 웹+앱, 주당) | 6~8월 150~200 → 9/7 주 약 2,000 → 이후 824 → 532 | 급증 뒤 약 3배 수준에 안착 중 |
| 9/9~11 급증 | 웹 신규 355(그중 localhost 약 60), 앱 신규 126, 신규의 79~87% 가 클럽을 열었다 | 진짜 사람 — 아래 유입 경로 |
| 9/9~11 유입 (세션, 3일 합) | direct 304 · google-play 162 · linktr.ee 74 · l.instagram.com 27 · ig/social 6 · tiktok.com 3 | 인스타발(당시 바이오 = 링크트리)이 명시적으로만 100여 세션. 인스타 인앱 브라우저는 출처를 자주 지워 direct 로 떨어지므로 direct 의 상당수도 인스타로 추정 |
| 조회 → 연락 (클럽, 사용자) | 웹 31~39%, 앱 36~41% | 급증 전후 같음 |
| 조회 → 연락 (클럽, 이벤트) | 웹 약 10%, 앱 17~25% | 앱이 웹의 약 2배 |
| 등록 완료 `club_register` | 6월 4 · 7월 1 · 8월 0 · 9월 28 | 수정 포함. 웹은 폼 연 62명 → 게이트 7 → 완료 1 (9/6 주) |
| 공유 버튼 vs 딥링크 유입 | 공유 월 10건 안팎 vs 딥링크 9월 184건 | 유입 링크는 대부분 앱 밖(챗봇·인스타 등)에서 온다 |
| 앱 삭제 / 첫 실행 (9월) | 66 / 257 (약 26%) | 1회성 창구라 실패 신호로 보지 않는다 |
