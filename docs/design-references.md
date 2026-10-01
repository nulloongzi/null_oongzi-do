# 디자인 참고자료 — UI/UX 와 브랜드

> 디자인 개선 아이디어를 낼 때 펼쳐 보는 자료집. **두 갈래로 나눈다.**
> - **A. UI/UX** — "쓰기 편한가." 정답에 가까운 원칙과 숫자가 있다(대비 4.5:1, 터치 44pt 같은).
> - **B. 브랜드** — "누룽지다운가." 정답이 없고, 누룽지가 정한다. 틀은 빌려 오고 내용은 `PHILOSOPHY.md` 에서 온다.
>
> 이미 정한 규칙은 `design-system.md`(원본), 웹·앱 검수는 `visual-parity.md`. 이 문서는 **다음에 무엇을 고칠지** 고르는 재료다.
> 작성 2026-10-01. 출처 표시: ✅ 원문을 읽음 · 🔎 검색 요약만 봄(원문 미확인) · 📥 원문 수집 필요(§C).

## 0. 용어 사전 (먼저 읽기)

| 말 | 뜻 | 누룽지도에서 |
|---|---|---|
| UI | 화면에 보이는 것 — 버튼, 시트, 색, 글자 | 지도 위 버튼, 상세 시트 |
| UX | 쓰면서 겪는 것 — 찾기 쉬운가, 헷갈리지 않는가 | "요일로 팀 찾기가 한 번에 되나" |
| 휴리스틱 | 경험에서 나온 점검 원칙. 체크리스트처럼 화면을 훑는다 | §A-1 닐슨 10원칙 |
| 대비(contrast) | 글자색과 바탕색의 밝기 차이. 숫자(예 4.5:1)로 잰다 | §A-5 표 |
| 터치 영역 | 손가락이 눌러지는 실제 범위. 보이는 크기보다 클 수 있다 | 탭 버튼 높이 |
| 바텀시트 | 화면 아래에서 올라오는 판 | 클럽 상세 |
| 빈 상태(empty state) | 아직 내용이 없는 화면 | 도시락이 비었을 때 |
| UX 라이팅 | 버튼·안내·에러 문구 쓰기 | "이 위치로 주소 설정" |
| 브랜드 | 사람들이 누룽지에 대해 갖는 **느낌**. 로고가 아니다 | §B-1 |
| 보이스 / 톤 | 보이스 = 늘 같은 성격, 톤 = 상황에 따라 바뀌는 말투 | §B-3 |
| 디자인 토큰 | 색·모서리 같은 값을 이름 붙여 한곳에 둔 것 | `tokens/design-tokens.json` |

---

## A. UI/UX — 쓰기 편한가

### A-1. 기초 원칙 두 가지만

**닐슨의 사용성 10원칙** 🔎 — 화면을 점검할 때 쓰는 가장 오래되고 널리 쓰는 목록(1994~).
1 시스템 상태를 보여줘라 · 2 사용자의 말을 써라 · 3 되돌릴 수 있게 · 4 일관성과 표준 · 5 실수 예방 ·
6 기억보다 알아보기 · 7 숙련자용 지름길 · 8 군더더기 없이 · 9 에러를 알아보고 고치게 · 10 도움말.
- 원문: https://www.nngroup.com/articles/ten-usability-heuristics/ 📥
- 누룽지도에 대 보면: **4(일관성)** 는 이번 웹·앱 통일 작업이 바로 이것. **6(알아보기)** 은 이모지만 있는 버튼(🍱🍚)이 처음 온 사람에게 뜻이 보이는지. **1(상태)** 은 "인증된 팀 ✓" "급구 🔥" 같은 표시.

**UX 법칙(Laws of UX)** 🔎 — 심리학에서 온 짧은 법칙 모음. 셋만 기억해도 된다.
- **피츠의 법칙**: 크고 가까운 버튼이 빨리 눌린다 → 자주 쓰는 버튼은 엄지 닿는 아래쪽에, 크게.
- **힉의 법칙**: 고를 게 많을수록 늦어진다 → 필터 칩(지역 8·요일 7·대상 7)을 한 화면에 다 펼칠지.
- **제이콥의 법칙**: 사람들은 다른 앱에서 익힌 대로 기대한다 → 지도 앱이면 카카오맵·네이버지도처럼 움직여야 덜 헷갈린다.
- 원문: https://lawsofux.com/ 📥 (책도 있음: https://lawsofux.com/book/)

### A-2. 모바일 화면의 숫자 기준

| 기준 | 값 | 출처 |
|---|---|---|
| 글자 대비 (본문) | **4.5:1 이상** | WCAG 2.2 AA ✅(Apple HIG 가 같은 값을 인용) |
| 글자 대비 (큰 글자 18pt+ 또는 굵은 글자) | 3:1 이상 | 같음 |
| 터치 영역 (iOS) | **44×44pt** 기본, 최소 28×28 | Apple HIG Accessibility ✅ |
| 터치 영역 (Android) | 48×48dp — 아이콘이 24여도 둘레 여백까지 48 | Material 🔎 |
| 버튼 사이 간격 | 크기만큼 중요 — 잘못 누르지 않게 | Apple HIG ✅ |

- Apple HIG Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility ✅
- WCAG 대비 해설: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html 📥 · 쉬운 해설 https://webaim.org/articles/contrast/ 📥
- 터치 영역 정리: https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/ 🔎

### A-3. 누룽지도 화면 패턴별 자료

| 패턴 | 핵심 | 자료 |
|---|---|---|
| **바텀시트** (클럽 상세·필터·픽업 목록) | 지금 맥락(지도)을 남겨 둔 채 정보를 보여주는 판. **시트 위에 시트를 또 띄우지 말 것**, 긴 내용엔 맞지 않음, 늘 필요한 도구를 넣는 자리가 아님 | NN/g https://www.nngroup.com/articles/bottom-sheet/ 🔎📥 |
| **지도 마커·클러스터** | 묶음에 숫자 표시, 누르면 확대, 확대 끝에서도 겹치면 펼치기. 마커는 지도 바탕 위에서 대비가 커야 한다 | https://mapuipatterns.com/cluster-marker/ 🔎 · https://www.eleken.co/blog-posts/map-ui-design 🔎 |
| **빈 상태** (빈 도시락, 검색 결과 0) | 비어 있는 이유 + 다음에 할 일 버튼. 첫 사용자에게 사용법을 가르치는 자리 | NN/g https://www.nngroup.com/articles/empty-state-interface-design/ 🔎📥 |
| **에러 메시지** (등록 폼, 로그인) | 문제 난 자리 바로 옆에, 색만으로 알리지 말고, 탓하지 말고 고치는 법을 말하기 | NN/g https://www.nngroup.com/articles/error-message-guidelines/ 🔎📥 · 폼 에러 10원칙 https://www.nngroup.com/articles/errors-forms-design-guidelines/ 🔎 |

### A-4. UX 라이팅 (버튼·안내 문구)

- **토스의 8가지 라이팅 원칙** 🔎 — 한국어 UX 라이팅의 사실상 교과서. 다음 화면을 예측할 수 있는 힌트, 명확·간결·친근 등.
  원문 https://toss.tech/article/8-writing-principles-of-toss 📥 · 앱인토스 UX 라이팅 가이드 https://developers-apps-in-toss.toss.im/design/ux-writing.html 📥
- **Material 커뮤니케이션 원칙(한국어 코드랩)** 🔎 https://codelabs.developers.google.com/codelabs/material-communication-guidance?hl=ko 📥
- 누룽지도 메모: 외국인이 진지한 축이라(PHILOSOPHY) **영어 문구도 같은 원칙**으로 본다. 음식 비유(밥이름·도시락)는 영어에서 뜻이 전달되는지 따로 확인할 것.

### A-5. 누룽지도에서 지금 찾은 개선 후보 (코드에서 확인)

자료를 읽기 전에도 고를 수 있는 것들. **아직 고치지 않았다** — 고를 때 이 표에서 시작한다.

| # | 무엇 | 근거 | 숫자 / 위치 |
|---|---|---|---|
| U1 | **급구 지도 라벨의 흰 글자가 주황 바탕에서 잘 안 읽힌다** | 대비 4.5:1 미달 | 흰색/`#ff7043` = **2.74:1** · 웹 `.label.urgent`, 도시락 편집 버튼 `.lb-edit-btn.editing` |
| U2 | 브라운 보조 글자가 크림 바탕에서 기준 바로 아래 | 대비 | `#8d6e63`/`#fff8e1` = **4.35:1** (흰 바탕에선 4.62 통과) |
| U3 | 동호회/픽업 탭 비활성 글자가 흐리다 | 대비 | 웹 `#9e8e84`/흰색 = 3.15:1 (굵은 14px 라 큰 글자 기준 3:1 은 겨우 통과) |
| U4 | 픽업 틸을 글자색으로 쓰면 안 읽힌다 | 대비 | `#13a89e`/흰색 = 2.95:1 — 지금은 테두리·핀에만 쓰고 글자는 `#0b6b64`(6.36) 라 괜찮다. 규칙으로 남길 것 |
| U5 | 동호회/픽업 탭 버튼 높이가 44 보다 낮다 (추정) | 터치 44pt | 웹 padding 7+7 + 글자 ≈ 31~33px, 앱 ≈ 33 — 실측 필요 |
| U6 | **웹 지도 버튼(🍱🍚📍)에 읽어 줄 이름이 없다** — 앱은 있다 | 접근성 · 웹↔앱 패리티 | 웹 `index.html` 의 `div` 3개에 `aria-label`·`role="button"` 없음. 앱 `_fab` 은 `Semantics(label:)` 있음 |
| U7 | 이모지 버튼은 기기마다 그림이 다르다 (아이폰·삼성·윈도우 이모지가 다름) | 일관성 · 알아보기 | 지도 FAB 4개 전부 이모지. 브랜드 아이콘으로 바꿀지는 B 와 같이 정한다 |
| U8 | 9~11px 글자가 16곳 | 가독성 | `css/main.css` — 어디가 꼭 작아야 하는지 골라 볼 것 |

참고: 옐로 `#fac710` 위 다크 글자는 7.14:1 로 아주 좋다. **옐로 바탕에 흰 글자는 1.59:1 이라 금지**(지금은 안 쓴다).

---

## B. 브랜드 — 누룽지다운가

### B-1. 브랜드가 뭔지부터

**마티 뉴마이어, 『브랜드 갭(The Brand Gap)』** 🔎 — 가장 짧고 쉬운 입문서(그림책에 가깝다).
- "브랜드는 제품·회사에 대해 **한 사람이 갖는 직감(gut feeling)**이다. 로고도, 글꼴도 아니다."
- 브랜드는 회사가 아니라 **각 사람의 머릿속**에서 정해진다 → 우리가 할 수 있는 건 그 느낌을 일관되게 건드리는 것.
- 소개: https://www.goodreads.com/book/show/290733.The_Brand_Gap 🔎 · 요약 https://auresnotes.com/summary-the-brand-gap-marty-neumeier/ 🔎

> 누룽지도에 대 보면: PHILOSOPHY 의 "여기 와도 돼"라는 신호, "누룽지에게 DM하는 느낌"이 바로 이 직감이다.
> 디자인 작업은 전부 **이 직감을 더 선명하게 하는가**로 판단하면 된다.

### B-2. 브랜드 정체성을 정리하는 틀 — 카페레 프리즘

**카페레의 브랜드 정체성 프리즘(Kapferer Brand Identity Prism, 1986)** 🔎 — 여섯 면으로 "우리는 누구인가"를 적는 틀.
https://www.toolshero.com/marketing/brand-identity-prism/ 🔎 · 예시 https://inkbotdesign.com/kapferers-brand-identity-prism/ 🔎

누룽지로 채운 **초안** (출처는 `PHILOSOPHY.md` — 누룽지가 고쳐 쓴다):

| 면 | 질문 | 누룽지 초안 |
|---|---|---|
| 겉모습(Physique) | 눈에 보이는 것 | 밥그릇+배구공 로고, 옐로·크림·브라운, Pretendard, 둥근 모서리 |
| 성격(Personality) | 사람이라면 어떤 사람 | 동네 배구 잘 아는 친근한 형/누나, 가볍고 따뜻함 |
| 문화(Culture) | 무엇을 믿나 | 접근성 > 위상, 환대, 합의(opt-in) — 가치 필터 1·3·5 |
| 관계(Relationship) | 사용자와 어떤 사이 | "DM 하면 알려주는" 사이 — 소개해 주는 친구 |
| 반영(Reflection) | 이걸 쓰는 사람은 어떻게 보이나 | 배구를 라이프스타일로 즐기는 사람 |
| 자기 이미지(Self-image) | 쓰면서 스스로를 어떻게 느끼나 | "나도 이제 동네 배구하는 사람" |

### B-3. 보이스 & 톤 — 누룽지가 말하는 법

**메일침프 콘텐츠 스타일 가이드 — Voice and Tone** ✅ (공개 원문, GitHub)
- "보이스는 늘 같고, 톤은 상대의 상황에 따라 바뀐다. 친구와 저녁 먹을 때와 상사와 회의할 때 말투가 다르듯."
- 메일침프 보이스 4가지: 평이하게 말한다 · 진짜처럼 말한다 · 어려운 말을 번역해 준다 · 유머는 담백하게.
- "늘 재미보다 **명확함**이 먼저. 억지 농담은 안 하느니만 못하다."
- 마스코트 Freddie 는 **웃고 윙크하지만 말하지 않는다** — 캐릭터 목소리로 글을 쓰지 않는다.
- 원문: https://github.com/mailchimp/content-style-guide/blob/master/02-voice-and-tone.html.md ✅ · 웹판 https://styleguide.mailchimp.com/voice-and-tone/ 📥

**NN/g — 톤의 4가지 축** 🔎 — 톤을 막연한 형용사 대신 네 개의 저울로 정한다.
https://www.nngroup.com/articles/tone-of-voice-dimensions/ 📥

| 축 | 한쪽 ↔ 다른 쪽 | 누룽지 초안 위치 |
|---|---|---|
| 유머 | 재미있게 ↔ 진지하게 | 재미 쪽 (밥 비유) — 단 에러·개인정보는 진지 |
| 격식 | 캐주얼 ↔ 격식 | 캐주얼 (~해요) |
| 존중 | 존중 ↔ 장난스러운 불경 | 존중 — 처음 오는 사람을 놀리지 않는다 |
| 열정 | 들뜬 ↔ 담담한 | 중간 — 느낌표 남발 금지 |

> 지금 `design-system.md` §4 보이스는 두 줄뿐이다. 위 두 자료를 틀로 **누룽지 보이스 한 쪽짜리**를 쓰는 게 브랜드 쪽 첫 과제 후보(§B-7).
> Apple HIG 도 같은 말을 한다 ✅: "모든 글에 브랜드 보이스를. 브랜드 색은 아껴서. 로고를 앱 곳곳에 반복하지 말 것. 시작 화면을 브랜딩 자리로 쓰지 말 것." https://developer.apple.com/design/human-interface-guidelines/branding

### B-4. 캐릭터 · 마스코트

- **듀오링고 Duo** 🔎 — 마스코트를 "감정 폭이 넓게" 다시 그렸다(놀람~기쁨). 학습 성과에 따라 기분이 바뀐다. 규칙 예: 눈동자를 가운데 두지 말 것(무서워 보임).
  공개 가이드 https://design.duolingo.com/ 📥 · 일러스트 규칙 https://design.duolingo.com/illustration 📥 · 해설 https://www.canny-creative.com/brand-breakdown/brand/duolingo/ 🔎
- **메일침프 Freddie** ✅ — 위 B-3: 말하지 않는 마스코트.
- 누룽지도 메모: 밥그릇+배구공은 이미 캐릭터가 될 재료다(합석 단계에서 밥그릇이 차오르는 표현이 이미 있다). 만든다면 **표정 몇 가지 + 말하는지 여부**부터 정한다.

### B-5. 한국 사례 — 작게 시작한 브랜드

| 사례 | 배울 점 | 자료 |
|---|---|---|
| **배달의민족 『배민다움』** | 'B급 문화'를 핵심 고객 취향에서 찾았다. 브랜드는 밖에 파는 것보다 **안에서 그렇게 사는 것**이 먼저. 전용 서체를 브랜드 자산으로 | 책 『배민다움』(홍성태) · 배민 소개 https://story.baemin.com/981/ 📥 · 요약 https://brunch.co.kr/@nolnoc/42 📥 |
| **당근 리브랜딩 (2023)** | 커지며 시각 이미지가 제각각이 되자 **'당근다움'을 다시 정의**하고 로고·색·서체·디자인 시스템(SEED)을 한 번에 정리 | https://about.daangn.com/blog/archive/당근-리브랜딩-프로세스-브랜드/ 📥 · 시작 이야기 https://about.daangn.com/blog/archive/당근-리브랜딩-비하인드-스토리/ 📥 · SEED v3 https://designcompass.org/2026/07/27/daangn-seed-design-system-rebranding/ 🔎 |
| **토스** | 라이팅 원칙을 공개하고 모든 문구에 적용 — 말투가 곧 브랜드 | §A-4 |

### B-6. 브랜드 가이드 예시 모음 (눈으로 보기)

다른 브랜드가 로고·색·글꼴·말투를 **한 문서로 어떻게 묶는지** 보는 용도.
- Frontify 19선 https://www.frontify.com/en/guide/brand-guidelines-examples 🔎
- Content Harmony 36선 https://www.contentharmony.com/blog/great-brand-guidelines/ 🔎
- Looka 28선 https://looka.com/blog/15-brand-guidelines-examples-to-inspire-your-brand-guide/ 🔎

### B-7. 누룽지에서 지금 찾은 브랜드 쪽 과제 후보

| # | 무엇 | 왜 |
|---|---|---|
| B1 | **누룽지 보이스 한 쪽** 쓰기 — 보이스 3~4개 + 상황별 톤 표(첫 방문·에러·축하·개인정보) + 금지어 | `design-system.md` §4 가 두 줄뿐. 메일침프 틀(B-3) |
| B2 | 프리즘 초안(B-2) 다듬기 — 특히 **외국인에게 보이는 누룽지** 한 줄 | 외국인이 진지한 축인데 브랜드 문서엔 한국어 감각만 있다 |
| B3 | 밥그릇 캐릭터 규칙 — 표정 수, 말하는지, 어디에 쓰고 어디엔 안 쓰는지 | 합석 단계·로고에 이미 쓰는 중. Duo·Freddie(B-4) |
| B4 | 이모지 아이콘 → 누룽지 아이콘 세트 검토 | U7 과 같은 문제를 브랜드 쪽에서 본 것. 기기마다 다른 그림이 브랜드를 흐린다 |
| B5 | 인스타·릴스·스토어 이미지의 **한 장짜리 브랜드 시트** (로고 쓰는 법, 색, 글꼴, 말투 예시) | 개인 브랜드 → 협업자·디자이너에게 건넬 문서가 없다. B-6 예시 참고 |

---

## C. Claude in Chrome 으로 모아 줄 것 (📥)

이 세션의 네트워크는 위 사이트 대부분을 막는다(검색 요약만 보인다). 아래 순서대로 **본문 전체를 복사해 주면** 이 문서의 🔎 를 ✅ 로 바꾸고 누룽지에 맞춰 요약한다.

| 우선 | 페이지 | 뽑을 것 |
|---|---|---|
| 1 | 토스 8가지 라이팅 원칙 https://toss.tech/article/8-writing-principles-of-toss | 8개 원칙 이름 + 각 예시 문장 |
| 2 | NN/g 톤의 4가지 축 https://www.nngroup.com/articles/tone-of-voice-dimensions/ | 네 축 설명 + 37개 톤 단어 표(있으면 https://www.nngroup.com/articles/tone-voice-words/ 도) |
| 3 | NN/g 바텀시트 https://www.nngroup.com/articles/bottom-sheet/ | 가이드라인 목록 전부 |
| 4 | 당근 리브랜딩 프로세스 https://about.daangn.com/blog/archive/당근-리브랜딩-프로세스-브랜드/ | '당근다움' 정의 방식, 작업 순서 |
| 5 | 닐슨 10원칙 https://www.nngroup.com/articles/ten-usability-heuristics/ | 원칙별 설명 한 단락씩 |
| 6 | NN/g 빈 상태 · 에러 메시지 (A-3 의 두 링크) | 가이드라인 목록 |
| 7 | 듀오링고 브랜드 가이드 https://design.duolingo.com/ (+ /illustration) | 마스코트·일러스트 규칙 |
| 8 | Laws of UX https://lawsofux.com/ | 법칙 목록 + 한 줄 설명 |
| 9 | 배민다움 소개 https://story.baemin.com/981/ | 배민다움 정의 |

받으면 할 일: 각 항목 원문 확인 표시, B1(누룽지 보이스) 초안, U1~U8 중 고칠 것 골라 `visual-parity.md` 와 함께 다음 작업으로.
