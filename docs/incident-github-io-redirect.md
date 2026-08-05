# 장애 — `nulloongzi.github.io` → `nulloongzi.com` 리다이렉트 (미해결)

> 작성: 2026-08-05. **진행 중인 장애**다. 새 세션은 이 문서부터 읽고, 아래 "다음 세션이 먼저 할 일"의
> 응답 헤더 확인부터 하면 된다. 추측으로 시작하지 말 것 — 이 세션이 그러다 세 번 틀렸다.

## 증상

`https://nulloongzi.github.io/null_oongzi-do/` 로 접속하면 **`https://nulloongzi.com/null_oongzi-do/` 로 리다이렉트**되고, 그 도메인은 서빙하는 사이트가 없어 GitHub Pages 404("There isn't a GitHub Pages site here")가 뜬다.

**결과: 지도 웹앱 접속 불가.** PC 크롬·시크릿창·폰(모바일 데이터) 전부 동일. 루트(`nulloongzi.github.io/`)도 같은 증상.

## 발단

별도 세션에서 도메인(`nulloongzi.com`, Cloudflare) 구매 후 **`nulloongzi/nulloongzi.github.io` (org/user Pages 사이트)에 커스텀 도메인을 설정**했다.

user/org Pages 사이트에 커스텀 도메인을 걸면 GitHub은 `nulloongzi.github.io/*` 아래 **모든 경로**를 커스텀 도메인으로 301 리다이렉트한다 — **프로젝트 페이지(`/null_oongzi-do/`) 포함**. 그래서 지도가 새 도메인에서 열리게 됐고, 카카오맵 JS SDK는 도메인 화이트리스트 기반이라(`docs/share-kakao-setup.md`에 `https://nulloongzi.github.io`만 등록) SDK가 거부돼 **지도만 안 뜨는** 최초 증상이 났다.

그 뒤 커스텀 도메인을 제거했더니 이번엔 **리다이렉트만 남고 도착지가 비어** 404가 되는 현재 상태가 됐다.

## 확인 완료 — 여기는 원인이 아니다

이 세션에서 전부 직접 확인했다. 다시 파지 말 것.

| 항목 | 결과 |
|---|---|
| `nulloongzi.github.io` 레포 Pages **Custom domain** | 비어 있음 (스크린샷) |
| `nulloongzi.github.io` 레포 Pages | **Unpublish 완료** (스크린샷) |
| `null_oongzi-do` 레포 Pages **Custom domain** | 비어 있음 (스크린샷) |
| `null_oongzi-do` 레포 Pages | 발행 중 · 재배포 성공 (런 `30792995728`, 2026-08-05 07:10 UTC, 3잡 전부 success) |
| 두 레포 **CNAME 파일** | 없음 (`git ls-tree -r`로 재귀 확인) |
| 워크플로가 CNAME 주입? | 없음 (`.github/` 전체 grep) |
| 배포 내용에 `nulloongzi.com` 문자열 | 0건 (`git grep origin/main`) |
| **서비스 워커** | 레포에 없음 (등록 코드·파일 모두 없음) |
| meta refresh / `location` 리다이렉트 | 없음 (`social-auth.js`의 `location.href`는 로그인 클릭 시에만) |
| 브랜드 페이지 "웹에서 열기" href | `https://nulloongzi.github.io/null_oongzi-do/` — **정상** |
| 브라우저 캐시 | 전체 기간 삭제함. 폰(다른 기기)에서도 동일 → **브라우저 캐시 아님** |

## 이 세션이 틀린 진단 3개 (반복 금지)

1. **캐시버스터 `?v=16` 미갱신** — 무관. (단 이건 별개로 여전히 미해결 과제다, 아래 참고)
2. **브라우저 301 캐시** — 폰에서도 재현되므로 아님.
3. **`null_oongzi-do` 레포에 커스텀 도메인이 걸려 있을 것** — 비어 있었음.

## 남은 가설

1. **GitHub 엣지/라우팅에 리다이렉트가 잔존.** 커스텀 도메인 제거 후에도 GitHub 측 라우팅 캐시가 안 풀리는 알려진 유형. 재배포로도 안 풀렸다면 **GitHub Support 문의가 정답**일 가능성이 높다.
2. **Cloudflare 쪽 리다이렉트 룰.** 가능성은 낮다 — `nulloongzi.github.io` 트래픽은 Cloudflare를 안 거친다. 다만 Cloudflare에 **Redirect Rules / Page Rules / Bulk Redirects**가 남아 있는지는 이 세션에서 **확인하지 못했다**(콘솔 접근 불가). 확인 가치 있음.
3. **org 계정 수준의 도메인 검증/등록 잔존** (GitHub Settings → Pages → verified domains).

## 다음 세션이 먼저 할 일

### ① 응답 헤더 확인 (가장 중요)

이 세션은 네트워크 정책이 `*.github.io`를 막아(CONNECT 403) **라이브를 한 번도 직접 못 봤다.** 스크린샷 추정만으로 진단하다 세 번 틀렸다. **접근 가능한 환경에서 이것부터 실행:**

```bash
curl -sSI https://nulloongzi.github.io/null_oongzi-do/
curl -sSI https://nulloongzi.github.io/
```

읽을 것:
- `HTTP/2 301` + `location: https://nulloongzi.com/...` → **GitHub이 서버에서 리다이렉트 중**. → 가설 1 확정, Support 문의.
- `server:` 헤더가 `GitHub.com`인지 다른 것인지 (Cloudflare가 끼면 `cloudflare`)
- 200이 나오면 → 이미 풀린 것. 사용자 환경 문제로 좁혀짐.

### ② Cloudflare 확인

`nulloongzi.com` 존 → **Rules → Redirect Rules / Page Rules / Bulk Redirects**에 항목이 있는지. 있으면 삭제.

### ③ 그래도면 GitHub Support

레포 2개 이름, 커스텀 도메인을 걸었다 뗀 시각, 위 curl 출력을 첨부해서
"custom domain removed but `user.github.io` still 301-redirects to it" 로 문의.

## 하지 말 것

- **DNS 레코드 삭제 금지.** Cloudflare의 A×4 + www CNAME은 나중에 `do.nulloongzi.com` 전환 때 재사용한다. 레코드만으론 아무것도 안 깨진다.
- **웹 레포 main 롤백 금지.** 이번 장애는 코드와 무관하다. 롤백하면 픽업 기능만 사라지고(등록된 서울 4팀이 화면에서 사라짐) 리다이렉트는 그대로다.

## 배운 것 — 도메인 전환 시 순서

`docs/handoff-custom-domain.md`에도 반영할 것:

1. **org/user Pages 사이트(`<owner>.github.io`)에 커스텀 도메인을 걸면 프로젝트 페이지까지 전부 끌려간다.** 프로젝트를 별도 도메인으로 두려면 프로젝트 레포에 자기 `CNAME`을 먼저 줘야 한다.
2. **콘솔 먼저, CNAME 나중.** 카카오(SDK 도메인·대표 도메인·Redirect URI) / Firebase 승인 도메인 / 네이버를 **전부 등록한 뒤에** 도메인을 붙인다. 이번 사고는 정확히 그 반대 순서로 났다.
3. 커스텀 도메인 제거는 **되돌리기가 깨끗하지 않다.** 붙이기 전에 되돌릴 수 있는지부터 확인할 것.

## 부수 미해결 과제

- **캐시버스터 미갱신**: 픽업 PR(#45)에서 `js/pickup-filter.js`를 새로 추가하면서 `index.html`의 `?v=16`을 안 올렸다. `index.html` 주석이 "배포할 때마다 올려 혼합버전 방지"라고 명시하는데 어겼다. 장애와 무관하지만 고쳐야 한다 (`?v=17`).
- **핸드오프 문서 2개로 분기**: 이 레포 `docs/handoff-custom-domain.md`(구식, apex 단일 전제)와 별도 세션이 만든 `claude/custom-domain-handoff-wyd9xx` 브랜치 문서. 하나로 합치고 나머지는 삭제할 것.

## 현재 상태 (2026-08-05)

- 웹 main = `ffd0de1` (픽업 크루 기능 머지 완료). Firestore 룰 배포 완료.
- 서울 크루 4팀(DVB/SUS/OP/NEST) Firestore 등록 완료 — **데이터는 안전하다.** 사이트만 접속 불가.
- 앱 `2.2.0+8` 머지 완료, 서명 AAB 빌드됨(런 #6, 아티팩트 만료 2026-08-17). **스토어 업로드 미완.**
- 미머지 브랜치 `claude/latest-aab-store-registration-85dxtg`(웹): 픽업 탭 크롬 정리(FAB 숨김·헤더 2줄) + `docs/handoff-custom-domain.md`
- 미머지 브랜치 동명(앱): 픽업 기본 뷰 = 목록
