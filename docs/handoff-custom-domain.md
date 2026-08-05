# 핸드오프 — 커스텀 도메인 전환 (다음 세션 시작점)

> 작성: 2026-08-04. 픽업 크루 소개 기능(웹 #45 / 앱 #21)을 머지한 직후, 도메인 구매를
> 별도 세션으로 넘기며 남긴다. **이 문서부터 읽고 시작하면 된다.**
>
> **갱신: 2026-08-04 (같은 날, 도메인 세션).** `nulloongzi.com` 구매 완료. 도메인 이름·구조
> 결정이 아래 "도메인 — 결정 완료" 섹션에 있다. ~~전환 작업 자체는 여전히 스토어 등록 후.~~
>
> **갱신: 2026-08-05 — 전환을 앞당겨 실행 중.** apex 조기 설정 사고의 스테일 301이 GitHub 엣지에
> 고착되어(user site 재발행으로도 즉시 안 풀림), 리다이렉트와 싸우는 대신 **전환을 지금 하는 게 싸다**고
> 판단. 어차피 전환하면 그 301이 원하는 동작이 된다. 순서 근거도 소멸: **2.2.0+8이 스토어에 업로드되지
> 않았으므로** 도메인 박힌 **2.3.0+9 하나로 합쳐 제출**하면 릴리스 사이클이 한 번 준다.
> 웹 코드 전환(A 체크리스트 웹 항목 전부 + CNAME + assetlinks.json + 캐시버스터 v=17)은 이 브랜치에서
> 완료, 유닛 115 통과. **콘솔 등록(B)이 머지보다 먼저다 — "콘솔 먼저, 도메인 나중".**

## TL;DR

- **현재 서비스 도메인은 `https://nulloongzi.github.io/null_oongzi-do/`.** `CNAME` 파일이 없어 커스텀 도메인 미설정.
- **`nulloongzi.com`을 Cloudflare Registrar에서 구매 완료 (2026-08-04).** 구조: apex는 개인 PR 사이트, 지도는 `do.nulloongzi.com` 서브도메인. 아직 DNS·코드 전환은 안 했다.
- 일부 문서(`handoff-deploy-marketing.md`, `marketing-launch.md`)에 `nulloongzido.com`이라 적혀 있는데 **그건 틀린 기록이다.** 산 적 없고 앞으로도 안 산다(`nulloongzi.com`으로 확정). 코드·콘솔은 전부 github.io 기준.
- 도메인을 사기로 한 이유와 **전환 시 손봐야 할 곳 전체 목록**이 아래에 있다. 하나라도 빠지면 소셜 로그인이나 카카오 공유가 조용히 깨진다.

---

## 왜 사기로 했나

일반론이 아니라 이 제품의 구체적 이유 셋:

1. **핵심 기능이 "링크 하나 보내기"다.** 방금 만든 픽업 목록 공유(`?tab=pickup&region=서울&english=1`)는 외국인 인스타 DM에 URL을 던지는 흐름이다. `nulloongzi.github.io/null_oongzi-do/?tab=...`은 DM 말풍선에서 두세 줄로 깨진다. PHILOSOPHY의 "누룽지에게 DM하는 느낌"에는 URL 생김새도 포함된다.
2. **외국인이 첫 접점이다.** `github.io` 서브패스는 개발자에게나 익숙하다. beachhead가 외국인이라 "이게 진짜 서비스 맞나" 신호가 더 아프다.
3. **지금이 갈아탈 마지막 싼 시점.** 아직 배포된 링크가 거의 없다. 릴스·스토리카드·QR로 github.io 링크가 수백 개 뿌려진 뒤엔 전부 리다이렉트 의존이 된다.

### 덤: App Links가 지금은 애초에 작동 불가

`android/app/src/main/AndroidManifest.xml`에 `autoVerify="true"` App Links가 걸려 있는데, 검증에는 **`https://nulloongzi.github.io/.well-known/assetlinks.json`** 이 필요하다. 그건 org 루트라 **`nulloongzi.github.io` 라는 별도 레포**가 있어야 올릴 수 있다. 지금 구조에선 사실상 불가능하고, 그래서 공유 링크는 앱이 아니라 브라우저로 폴백하고 있다(주석에도 그렇게 적혀 있음).

**커스텀 도메인을 쓰면 루트에 파일을 놓을 수 있어 이 문제가 같이 풀린다.** 도메인 전환의 부수 효과 중 제일 값어치 있는 항목. (결정된 구조 기준: `do.nulloongzi.com`의 루트가 곧 이 레포 루트이므로, `.well-known/assetlinks.json`을 이 레포에 커밋하면 끝. 별도 레포 불필요.)

---

## 언제 하나 — 순서 주의

**앱 2.2.0+8 스토어 등록이 끝난 뒤에 시작할 것.**

지금 URL을 바꾸면 `lib/services/share_service.dart`의 `siteBase`가 앱 바이너리에 박혀 있어 AAB를 다시 빌드해야 하고(versionCode 9), 스토어 심사 중 도메인 전환까지 겹치면 뭐가 터졌는지 분간이 안 된다.

1. ~~도메인 **구입만** 먼저 (몇 분)~~ ✅ 완료 (2026-08-04, `nulloongzi.com`)
2. 4팀 등록 + AAB 스토어 등록 마무리 ← 이게 먼저
3. 그 다음 도메인 전환을 별도 작업으로

---

## 도메인 — 결정 완료 (2026-08-04)

**`nulloongzi.com` 구매 완료.** Cloudflare Registrar, 연 $11 안팎, 자동갱신 켤 것. 계정: paulyoo999@gmail.com.

`nulloongzido.com`이 아니라 `nulloongzi.com`을 산 이유: 더 짧고, 인스타 핸들 로마자 표기와 일치하고, **개인 브랜드가 도메인의 뿌리**가 되는 구조라서다(PHILOSOPHY: 앱은 개인 브랜드의 지도 버전). 프로젝트가 늘어도 도메인을 또 살 필요가 없다.

### 구조

| 호스트 | 용도 | 레포 |
|---|---|---|
| `nulloongzi.com` (apex) | 개인 PR 사이트 | `nulloongzi/nulloongzi.github.io` (신규 필요) |
| `do.nulloongzi.com` | 누룽지도 (지도) | `nulloongzi/null_oongzi-do` |
| (미래) `referee.nulloongzi.com` 등 | AI심판 등 새 프로젝트 | 프로젝트별 레포 |

- 경로 방식(`nulloongzi.com/null_oongzi-do`)이 아니라 **서브도메인 방식**을 택했다. 레포 간 간섭이 없고, URL이 짧고, 콘솔 등록도 지도가 사는 호스트 하나면 된다.
- App Links용 `.well-known/assetlinks.json`은 `do.nulloongzi.com` 루트 = **이 레포 루트**에 두면 된다. org 루트 레포 없이도 풀린다.
- 유지비는 도메인 갱신료가 전부다. GitHub Pages·서브도메인·HTTPS 전부 무료.

### DNS (Cloudflare 대시보드에서)

Cloudflare Registrar는 네임서버가 Cloudflare 고정이므로 DNS도 같은 대시보드에서 관리한다.

| 타입 | 이름 | 값 | 비고 |
|---|---|---|---|
| A | `@` | `185.199.108.153` / `.109.153` / `.110.153` / `.111.153` (4개) | PR 사이트용, GitHub Pages IP |
| CNAME | `www` | `nulloongzi.github.io` | www → apex 리다이렉트 |
| CNAME | `do` | `nulloongzi.github.io` | 지도용 — **전환 작업 때** 추가 |

- 처음엔 **DNS only(회색 구름)**로 만들 것. 프록시(주황 구름)를 켜면 GitHub Pages의 인증서 발급이 꼬일 수 있다. 안정된 뒤 프록시는 선택.
- GitHub → Settings → Pages → **verified domains**에 `nulloongzi.com` 등록 권장(TXT 레코드 인증). 도메인 탈취 방지.

> ⚠️ **apex 설정 타이밍 함정 (중요).** user site 레포(`nulloongzi.github.io`)의 Pages 설정에 커스텀 도메인을 넣는 순간, GitHub은 **자기 커스텀 도메인이 없는 같은 계정의 모든 프로젝트 페이지를 새 도메인 아래로 리다이렉트한다.** 즉 지도가 `nulloongzi.com/null_oongzi-do/...`로 이동해버린다 — 콘솔(카카오 3곳/네이버/Firebase)에 새 도메인이 등록돼 있지 않으면 그 시점부터 로그인·공유가 조용히 깨진다.
> → **PR 사이트 레포에 코드를 올리는 것까지는 언제든 안전**하지만(github.io로 서빙), **Pages의 custom domain 입력은 지도 전환 작업과 같은 날 하거나, 그 전에 콘솔 3사에 새 도메인을 추가 등록(기존 항목 유지, 추가만)해둔 뒤에 할 것.**
>
> **2026-08-04 실제 사고 (이 함정에 실제로 물림).** DNS 레코드를 넣은 김에 Pages custom domain까지 입력 → 위 리다이렉트가 즉시 발동, 지도의 소셜 로그인 3종·카카오 공유가 전부 깨짐(`social-auth.js`의 `redirectUri()`가 `location.origin` 기반이라 미등록 URI를 전송). **당일 custom domain을 제거해 원복.** DNS 레코드(A 4개 + www CNAME, 전부 DNS only)는 남겨뒀고 재사용하면 된다 — DNS 레코드만으로는 아무것도 안 깨진다. **재입력은 반드시 지도 전환 작업의 일부로, 콘솔 등록과 같은 날 할 것.**

---

## 전환 체크리스트

### A. 코드 (레포 2개)

**웹 `nulloongzi/null_oongzi-do`**

| 파일 | 내용 |
|---|---|
| `CNAME` (신규) | `do.nulloongzi.com` 한 줄. GitHub Pages 커스텀 도메인 활성화 |
| `js/share.js:195` | `window.SITE_BASE_URL` — 공유 URL 전체의 뿌리 |
| `index.html:14,15,21` | `og:image` / `og:url` / `twitter:image` |
| `functions/index.js:534` | `DEFAULT_THUMB` (카카오 챗봇 썸네일) |
| `tests/spot-story-card.test.js:127,164,222` | 하드코딩된 기대값 3곳 — **안 고치면 유닛 테스트가 깨진다** |
| `tests/functions-provider-http.test.js:188` | `redirectUri` 기대값 |

**앱 `nulloongzi/null_oongzi-do-app`**

| 파일 | 내용 |
|---|---|
| `lib/services/share_service.dart:8` | `siteBase` — 클럽/스팟/픽업목록 URL 전부 여기서 나온다 |
| `lib/widgets/share_menu.dart:75` | 로고 이미지 URL |
| `android/app/src/main/AndroidManifest.xml:117` | App Links `android:host` → `do.nulloongzi.com`, 서브패스가 사라지므로 `pathPrefix` 제거 |
| `pubspec.yaml` | `2.2.0+8` → `2.3.0+9` |

> ⚠️ **앱은 재빌드·재출시가 필요하다.** 도메인만 바꾸고 앱을 안 올리면, 구버전 앱이 만드는 공유 링크는 계속 옛 도메인을 가리킨다. → **옛 도메인 리다이렉트를 반드시 유지할 것.**

### B. 외부 콘솔 — 여기가 진짜 위험 구간

하나라도 빠지면 **조용히 깨진다.** 에러 없이 그냥 동작 안 하는 유형이라 나중에 원인 찾기가 어렵다.

| 콘솔 | 설정 | 빠뜨리면 |
|---|---|---|
| **카카오** — 플랫폼 키 → JavaScript 키 → **JavaScript SDK 도메인** | 새 도메인 (끝 슬래시 없이) | 공유 카드 자체가 안 보내짐 |
| **카카오** — 앱 → 제품 링크 관리 → **웹 도메인(대표 도메인)** | 새 도메인 (끝 슬래시 없이) | **카드는 떠도 탭하면 안 열림** ← 과거 실제로 겪은 증상, `docs/share-kakao-setup.md`에 기록 |
| **카카오** — **Redirect URI** | 새 도메인 (경로 **완전 일치**) | 카카오 로그인 실패 (`docs/auth.md:63`) |
| **네이버** — 로그인 오픈 API 서비스 환경 | 웹 서비스 URL / Callback URL | 네이버 로그인 실패 |
| **구글** — Firebase Auth → 설정 → **승인된 도메인** | 새 도메인 추가 | 구글 로그인 팝업 차단 |
| **Play Console** | 개인정보처리방침 URL | 심사 반려 가능 |

> 카카오는 **세 군데가 서로 다른 목록**이다(SDK 도메인 / 대표 도메인 / Redirect URI). 하나만 고치고 끝냈다고 착각하기 쉬움.

### C. 배포 (이번에 실제로 물린 함정)

**`firestore.rules`와 Cloud Functions는 머지해도 자동 배포되지 않는다.** GitHub Pages만 자동이다.

- 수동 배포: 레포 → Actions → **Deploy Functions** → Run workflow → `target` 칸에 값 입력
- 룰만: `firestore:rules` / Functions만: `functions` / 특정 함수: `functions:kakaoCustomToken`
- 폰에서도 돌릴 수 있게 만들어진 워크플로다

> **2026-08-04 실제 사고**: 픽업 PR 머지 후 좌표 없이 등록하니 `Missing or insufficient permissions`. 원인은 코드가 아니라 **룰 미배포**였다. 클라이언트는 `coordinates: null`을 보내는데 프로덕션 룰은 여전히 옛 버전이라 `null is map` = false로 거부. `target: firestore:rules`로 배포해 해결.
> → 도메인 전환에서 `functions/index.js`를 건드리면 **Functions 배포도 잊지 말 것.**

### D. 전환 후 검증

1. 새 도메인으로 접속 → 지도·픽업 탭 정상
2. **옛 github.io URL이 새 도메인으로 리다이렉트**되는지 (기존에 뿌린 링크 보호)
3. 소셜 로그인 3종: 구글 / 카카오 / 네이버 — **각각 실제로 로그인까지**
4. 카카오 공유: 카드 전송 + **카드 탭 시 링크 열림**(둘은 다른 문제)
5. 픽업 목록 공유 링크 `?tab=pickup&region=서울&english=1` 착지 시 필터 복원
6. 앱(신버전)에서 공유 → 새 도메인 URL 생성 확인
7. App Links: `.well-known/assetlinks.json` 올리고 링크 탭 시 앱으로 열리는지

---

## 참고 — 현재 상태 (2026-08-04)

- **웹**: 픽업 크루 기능 머지 완료(`ffd0de1`), Pages 반영됨, Firestore 룰 배포 완료
- **앱**: `2.2.0+8` 머지 완료(`5d5810b`), 서명 AAB 빌드됨([런 #6](https://github.com/nulloongzi/null_oongzi-do-app/actions/runs/30793083380), 아티팩트 만료 2026-08-17), **스토어 업로드 미완**
- **남은 것**: ① 서울 크루 4팀 등록(DVB/SUS/OP/NEST) ② AAB 내부테스트→프로덕션 ③ Play 데이터 안전 설문 갱신
- Play 라이브 버전: `2.1.0+7`, 설치 17회

### 이 문서와 함께 볼 것

- `docs/share-kakao-setup.md` — 카카오 도메인 3종의 차이, 과거 사고 기록
- `docs/auth.md` — 소셜 로그인 트러블슈팅
- `docs/deploy.md` — 수동 배포 워크플로 사용법
- `docs/PHILOSOPHY.md` — 도메인 결정도 결국 "누룽지에게 DM하는 느낌"에 종속

### 문서 정정 필요 (전환과 함께)

`nulloongzido.com`을 이미 쓰는 것처럼 적어둔 곳들 — **실제 도메인은 `nulloongzi.com`(지도는 `do.nulloongzi.com`)으로 확정됐으므로 전환 시 전부 고쳐야 한다.** 그대로 두면 영구히 틀린 기록이 된다:

- `docs/handoff-deploy-marketing.md:14,56`
- `docs/marketing-launch.md:103`
- `docs/chatbot-test-guide.md:30`
- `docs/security-review-log.md:8,143`
