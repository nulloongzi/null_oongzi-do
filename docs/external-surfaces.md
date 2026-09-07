# 외부 표면 점검 목록

지도 위 팀 데이터가 낡는 건 `guidelines.html` 2-3 으로 관리하는데, **제품 자신의 외부
표면**(링크트리·스토어·인스타 바이오 등)은 아무도 안 보고 있었다. 몇 개인지, 마지막으로
언제 확인했는지 적힌 데가 없었다.

깔때기 맨 위가 가장 오래된 정보를 들고 있으면, 사용자는 폐기된 폼을 채우고 구버전을 깐다.
**팀 데이터와 같은 주기로 여기도 점검한다.**

- **점검 주기**: 6개월 (`guidelines.html` 2-3 의 팀 데이터 점검과 같은 날에 함께)
- **다음 점검 예정**: 2027-03
- **마지막 점검**: 2026-09-07 (표의 1~6번 전부 확인 완료)

---

## 1. 도메인 · 정본 주소

| 항목 | 정본 값 | 비고 |
|---|---|---|
| 서비스 도메인 | `https://do.nulloongzi.com` | `CNAME` 파일. GitHub Pages 커스텀 도메인 |
| 옛 주소 | `nulloongzi.github.io/null_oongzi-do` | Pages 리다이렉트로 살아 있음. 새로 쓰지 말 것 |
| **쓰면 안 되는 주소** | `nulloongzido.com` | **구매된 적 없다.** `docs/handoff-custom-domain.md` 참고 |
| 앱 패키지명 | `com.nulloongzi.nulloongzido` | 패키지명은 도메인과 무관하게 유지(변경 불가) |

> `nulloongzido.com` 은 존재하지 않는 주소인데 카카오톡 알림 2종(인증 신청·거절 완료)의
> 링크에 남아 있었다 &mdash; 문자열로는 4곳 (2026-09-07 수정). 도메인 전환 때 코드 전역
> 치환에서 빠진 자리이고, 운영자 본인만 받는 알림이라 아무도 신고하지 않았다 —
> **grep 은 `nulloongzido.com` 과 `do.nulloongzi.com` 을 둘 다 걸어서 확인할 것.**

## 2. 우리가 관리하는 외부 표면

레포 밖이라 CI가 못 잡는다. 사람이 열어서 봐야 한다.

| # | 표면 | 가리켜야 할 곳 | 상태 (2026-09-07) |
|---|---|---|---|
| 1 | **링크트리** | 인앱 등록 폼 · Play Store | ✅ 정리 완료 |
| 2 | Play Console — 개인정보처리방침 URL | `https://do.nulloongzi.com/privacy.html` | ✅ 이미 새 주소로 저장돼 있었음 (2026-09-07 확인) |
| 3 | Play Console — 연락처 이메일 | `paulyoo999@gmail.com` | 확인 필요 |
| 4 | Play Console — 스토어 등록정보 | `docs/play-store-listing.md` 의 텍스트/스샷 | 릴리즈마다 출시 노트만 갱신 |
| 5 | 인스타그램 바이오 링크 | 링크트리 또는 `do.nulloongzi.com` | ✅ 확인 완료 |
| 6 | 유튜브 채널 소개란 | 〃 | ✅ 확인 완료 |
| 7 | 카카오 개발자 콘솔 — 리다이렉트 URI | `do.nulloongzi.com` (3곳) | 도메인 전환 시 등록 완료 |
| 8 | 네이버 개발자센터 — 콜백 URL | 〃 | 도메인 전환 시 등록 완료 |
| 9 | Firebase 콘솔 — 승인된 도메인 | 〃 | 도메인 전환 시 등록 완료 |

## 3. 점검 기록

### 3-1. Play Console 개인정보처리방침 URL &mdash; 이미 맞았다

`docs/play-store-listing.md` 가 오랫동안 `nulloongzi.github.io/...` 를 적어뒀길래
(2026-09-06 정정) 콘솔 값도 낡았을 거라 추정했는데, **실제로 열어보니 이미
`https://do.nulloongzi.com/privacy.html` 로 저장돼 있었다.**

> 문서가 낡았다고 해서 실물도 낡은 건 아니다. 이 표의 상태 칸은 **추정이 아니라 확인한
> 값만** 적는다 &mdash; 안 본 것을 "아마 문제 있음"으로 적으면 이 문서가 또 하나의
> 낡은 문서가 된다.

함께 공개된 정책 문서 — 필요하면 스토어 설명이나 링크트리에서 참조:

- `/terms.html` — 이용약관
- `/guidelines.html` — 운영 기준(등록·갱신·신고)
- `/privacy.html` — 개인정보처리방침
- `/data-deletion.html` — 데이터 삭제

### 3-2. 링크트리 (2026-09-07 정리 완료)

링크트리가 폐기된 Google Forms 2개(팀 등록·십시일반)와 구버전 APK 를 가리키고 있었다.
이건 "낡은 링크"가 아니라 **유입 경로가 두 개**라는 뜻이었다 &mdash; 누가 Forms 를 채우면
그 데이터는 Firestore 에 안 들어오고 그냥 사라진다. 인스타 팔로워 약 4,700명이 통과하는
유일한 관문이라 파급이 크다.

**Forms 응답함을 먼저 확인했고, 옮겨야 할 미처리 응답은 없었다.** 유실 없이 정리됐다.
링크는 인앱 등록 폼과 Play Store 로 교체 완료.

> 순서가 중요했다. 링크부터 바꿨으면 남아 있던 응답을 영영 못 찾았을 것이다.
> 다음 점검 때 같은 종류의 문제를 만나면 **입구를 닫기 전에 받은 것부터 본다.**

## 4. 점검할 때 돌리는 것

```bash
# 죽은 도메인이 코드/문서에 다시 스며들었는지
grep -rn "nulloongzido\.com" --include="*.js" --include="*.html" --include="*.md" . \
  | grep -v "handoff-custom-domain.md"   # 이 문서의 언급은 '안 샀다'는 역사 기록

# 외부로 나가는 URL 전수 (CDN·표준 스키마 제외)
grep -rhoE "https?://[a-zA-Z0-9./_%+-]+" index.html js/*.js functions/*.js \
  | grep -viE "w3\.org|schema\.org|googleapis|gstatic|jsdelivr|cdnjs|unpkg|fonts\.|kakaocdn|daumcdn" \
  | sort -u
```

레포 안은 이걸로 잡힌다. **2절 표의 1~6번은 브라우저로 직접 열어봐야 한다** — CI 가
대신해줄 수 없는 부분이고, 그래서 이 문서가 있다.
