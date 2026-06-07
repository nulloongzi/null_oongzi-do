# 누룽지도 — 디자인 명세 (Design Spec)

> **목적**: HTML 웹앱에서 구현된 모든 화면·컴포넌트의 **시각 디자인**을 한 문서에 확정해, Flutter(Android) 네이티브 앱으로 옮길 때 두 앱의 사용자 경험 괴리를 최소화한다.
> **짝 문서**: 동적 동작(상태·로직·Firestore·애니메이션 흐름)은 [`docs/flutter/`](./flutter/) 의 기능별 문서를 본다. 이 문서는 "어떻게 보이는가", 그쪽은 "어떻게 움직이는가".
> **원본 소스**: `index.html`, `css/main.css` (이 문서의 모든 수치는 거기서 추출·검증됨). 색/간격/반경 등을 임의로 바꾸지 말 것 — 바꾸려면 두 플랫폼을 함께 바꾼다.

---

## 0. 디자인 노스스타 (모든 결정의 기준)

> philosophy.md에서 확정. 새 위젯/스타일을 만들 때 항상 물어라: **"이게 아래를 통과하는가?"**

**한 줄**: *누룽지에게 DM하는 느낌.* 차가운 DB가 아니라 **동네 친구(누룽지)가 알려주는 따뜻한 지도.**

**핵심 정서 3가지**
1. **환대 > 위상.** 랭킹·별점·"best 클럽" 절대 금지. UI에 우열을 암시하는 요소(순위 뱃지, 점수, 정렬된 리더보드)를 두지 않는다. 모든 클럽은 동등하게 보인다.
2. **따뜻함.** 누룽지(눌은 밥)·도시락·밥·식단표의 음식 은유는 장식이 아니라 *"여기 와도 돼"* 라는 신호다. 색·아이콘·카피·모션 전부 이 따뜻함을 지지해야 한다. (이모지 🍱🍚🍙🥢🍽, 둥근 형태, 통통 튀는 spring 모션.)
3. **낮은 진입장벽.** 탐색은 로그인 없이 가능해야 한다. 로그인 벽은 "관리·인증"에만 둔다(문 두 개 구조). 처음 연 사람이 5초 안에 "내 동네에 배구가 있네"를 느끼게.

**외국인 축 (1급 시민)**
- 영어(i18n)는 부가 기능이 아니라 진짜 요구사항. 모든 텍스트·칩·가격·요일이 영어로 말이 돼야 한다.
- 영어 모드에서는 **6인제(6s)** 칩을 맨 앞으로 끌어올리고 강조한다. **English-OK**는 눈에 띄는 1급 필터/뱃지.

**인스타그램 친화 (차별점 — 제품의 심장)**
- 다른 배구 플랫폼과 가르는 핵심. **발견은 앱에서 → 자랑은 인스타에서 → 그 자랑이 다시 앱의 환대로** 돌아오는 플라이휠.
- 세 축이 끊기면 차별점이 사라진다: ① 딥링크(`?club=`/`?spot=`) ② 스토리 카드 + 링크 스티커 ③ `insta_reel` 임베드. 디자인·구현 모두 이 셋을 살린다.
- 영상/공유는 **환대의 증거**이지 별점·랭킹이 아니다(노스스타 1번과 충돌 금지). → 상세: [flutter/10-instagram-flywheel](./flutter/10-instagram-flywheel.md).

---

## 1. 디자인 토큰 (Design Tokens)

> Flutter에서는 이 토큰들을 `ThemeData` + 별도 `AppColors`/`AppSpacing`/`AppRadius` 상수 클래스로 1:1 박제하라. 하드코딩 금지.

### 1.1 컬러 (`css/main.css` `:root`)

| 토큰 | HEX / 값 | 용도 |
|---|---|---|
| `--white` | `#ffffff` | 카드/칩 표면 |
| `--nurungji-yellow` | `#fac710` | **주 브랜드색.** 강조 버튼, 선택된 칩, 마커, 활성 탭, st-bubble 테두리 |
| `--nurungji-brown` | `#8d6e63` | 보조색. 아이콘, 보조 텍스트, 도시락 식단 버튼, 등록 제출 버튼 |
| `--nurungji-dark` | `#4e342e` | **주 텍스트색**(따뜻한 다크 브라운). 닉네임, 타이틀, 적용 버튼 배경 |
| `--nurungji-bg` | `#fff8e1` | **전역 배경(크림).** body, 지도 로딩 전 배경, 캡처 배경 |
| `--nurungji-light` | `#fffde7` | 더 밝은 크림. 직접추가 버튼, 빈 셀 배경 |
| `--glass-bg` | `rgba(255,255,255,0.85)` | 글래스 표면(검색바, FAB) |
| `--glass-bg-darker` | `rgba(255,248,225,0.85)` | 글래스 표면 — 크림 톤(프로필/도시락 카드) |
| `--urgent-color` | `#ff7043` | **급구/주의색(딥 오렌지).** 급구 마커, 급구 FAB, 편집 모드, 필터 뱃지 |
| `--today-color` | `#d84315` | 시간표에서 "오늘" 요일 강조 |
| `--shadow` | `0 8px 32px rgba(93,64,55,0.15)` | 기본 그림자(따뜻한 갈색 기반, 검정 아님) |
| `--shadow-sm` | `0 4px 12px rgba(93,64,55,0.12)` | 작은 그림자 |

> **중요**: 그림자는 검정(`#000`)이 아니라 **갈색 베이스**(`rgba(93,64,55,...)`)다. 이게 따뜻함의 핵심 디테일. Flutter `BoxShadow(color: Color(0x26...))` 로 갈색 그림자를 쓸 것.

**픽업(Pickup) 전용 색** — 동호회(옐로)와 구분되는 **틸(teal)** 계열:

| 토큰 | 값 | 용도 |
|---|---|---|
| 픽업 마커/포인트 | `#13a89e` | 픽업 마커, 픽업 상세 결제/연락 버튼 |
| 픽업 라벨 테두리 | `#13a89e` / 글자 `#0b6b64` | 지도 위 픽업 라벨 |
| 픽업 종목 칩 | bg `#e3f2fd` / fg `#1565c0` | 리스트 sport 칩 |
| English 칩 | bg `#e8eefc` / fg `#2b50aa` | English-OK 강조 |
| 초보환영 칩 | bg `#e8f5e9` / fg `#2e7d32` | beginner |

### 1.2 타이포그래피

- **폰트**: `Pretendard Variable, Pretendard` (CDN: jsDelivr). 폴백은 system-ui 계열. → **Flutter: Pretendard를 `pubspec.yaml`에 번들**하고 기본 `fontFamily`로 지정. (네트워크 의존 제거.)
- 전역 `box-sizing: border-box`.
- 한국어 타이틀은 **`letter-spacing: -0.5px`** 로 약간 좁힌다(닉네임, 도시락 헤더, 필터 타이틀).

| 역할 | size / weight | 예시 위치 |
|---|---|---|
| 화면 타이틀 | 22px / 800 | 필터시트 제목 `검색 조건 설정` |
| 카드 타이틀(닉네임) | 24px / 800 | 프로필 닉네임 |
| 섹션/도시락 헤더 | 20px / 800 | `도시락 🍱` |
| 상세시트 타이틀 | 19~20px / 800 | 클럽/픽업 이름 |
| 본문 강조 | 15~16px / 700 | 검색 입력, 메인팀 |
| 본문 | 13~14px / 500~600 | info-row, 칩, 라벨 |
| 캡션/보조 | 11~13px / 600 | 가입일, expand-hint, 태그 |

### 1.3 간격·반경·모션

**Border-radius 스케일** (둥근 정도가 따뜻함을 만든다 — 인색하게 쓰지 말 것):
- 칩/작은 버튼: `8~16px`
- 입력/버튼: `10~14px`
- 카드/FAB: `16~24px`
- 큰 카드(프로필/도시락): `28px`
- 바텀시트 상단: `28~32px` (`border-top-left/right-radius`)
- 필터시트 하단: `0 0 32px 32px`

**여백**: 화면 가장자리 기본 `15px`(검색바·FAB 등 absolute 요소의 left/right). 카드 내부 패딩 `20~30px`.

**그림자**: §1.1의 갈색 그림자 토큰 사용. 강조 요소는 색 그림자(예: 옐로 버튼 `0 4px 12px rgba(250,199,16,0.3)`, 급구 FAB `0 6px 20px rgba(255,112,67,0.4)`).

**모션 이징 (이 3개만 쓴다)**:
| 용도 | cubic-bezier | Flutter `Curve` 대응 |
|---|---|---|
| **Spring(통통)** — 누르기, 카드 등장, FAB | `cubic-bezier(0.34,1.56,0.64,1)` | `Curves.easeOutBack` |
| **부드러운 시트/슬라이드** | `cubic-bezier(0.2,0.8,0.2,1)` | `Curves.easeOutCubic` 근사 (또는 커스텀 `Cubic(0.2,0.8,0.2,1.0)`) |
| 즉각 반응(드래그 추적) | `linear` / `0.1s` | `Curves.linear` |

**누르기 피드백(필수 디테일)**: 거의 모든 탭 가능한 요소가 `:active { transform: scale(0.9~0.98); }`. → Flutter에서 모든 버튼/칩/FAB/셀을 **누르면 살짝 축소**(scale 0.9~0.98, ~120ms)되게 래핑하라. (예: `AnimatedScale` + `GestureDetector`, 또는 공용 `BounceTap` 위젯.) 이게 빠지면 "차가운 앱" 느낌이 난다.

**등장 애니메이션**:
- 오버레이 배경: `fadeIn 0.3s` (opacity 0→1).
- 프로필 카드: `slideUp 0.3s` spring — `translateY(40px) scale(0.95) opacity:0` → `translateY(0) scale(1) opacity:1`.
- 공유 메뉴: `shareMenuUp 0.2s` — `translateY(24px) opacity:0.5` → 제자리.

### 1.4 글래스모피즘 (Glassmorphism)

검색바·FAB·바텀시트·필터시트·픽업패널 등 떠 있는 표면은 전부 **반투명 + 블러**:
- 배경 `rgba(255,255,255,0.85~0.98)` 또는 크림 `rgba(255,248,225,0.85)`
- `backdrop-filter: blur(6~20px)` (요소별로 6/10/12/16/20px)
- 반투명 흰 테두리 `1px solid rgba(255,255,255,0.5~0.8)`

> **Flutter 구현**: `BackdropFilter(filter: ImageFilter.blur(sigmaX:n, sigmaY:n))` + 반투명 `Color` + `Border.all(color: Colors.white.withOpacity(0.5))`. blur sigma는 CSS px의 절반 정도(blur(12px)≈sigma 6~8)로 시작해 눈으로 맞춘다. 성능 주의: 블러 표면을 너무 많이 겹치지 말고 `RepaintBoundary`로 격리.

### 1.5 z-index 레이어 순서

낮음→높음. Flutter에서는 `Stack` 쌓는 순서/`Overlay`/route 우선순위로 재현.

| z | 요소 |
|---|---|
| 0 | 지도(`#map`) |
| 15 | 픽업 리스트 패널 |
| 18 | 급구 티커 |
| 19 | 탭 바 |
| 20 | 검색바, FAB들(도시락/프로필/그룹) |
| 200 | 클럽 상세 바텀시트 |
| 210 | 픽업 상세 바텀시트 |
| 300 | 필터 시트 |
| 500 | 프로필/도시락 오버레이 |
| 9999 | 캡처 무대(화면 밖), 맵피커 |
| 10000 | 등록/픽업 모달 |
| 99999~100000 | 프리뷰 오버레이, 공유 메뉴 |

---

## 2. 전역 레이아웃 (지도 메인 화면)

배경은 풀스크린 지도(Kakao Map). 그 위에 떠 있는 요소들:

```
┌─────────────────────────────────────┐
│  [🔎  검색 입력…    │ EN │ ⚙️•]      │  ← 검색바 (top:15, 양옆15, h50)
│            ( 동호회 | 픽업 )          │  ← 탭 바 (top:70, 가로중앙 pill)
│  [🔥  급구 티커………………………]        │  ← 급구 티커 (top:116, 양옆15, h44)
│                                       │
│                 (지도)                │
│                                       │
│ 🍱(도시락)                            │  ← left:15, bottom:95
│                              📝(급구) │  ← fab-group right:15, bottom:30
│ 🍚(프로필)                    📍(내위치)│  ← 프로필 left:15 bottom:30
└─────────────────────────────────────┘
```

> 좌표는 모두 화면 가장자리 기준 `position: absolute`. Flutter는 `Stack` + `Positioned`(또는 `SafeArea` + `Align`)로. **`viewport-fit=cover` + safe-area** 를 쓰므로 노치/제스처바 인셋을 반드시 `SafeArea`/`MediaQuery.padding` 으로 처리.

### 2.1 검색바 `.search-container`
- 위치: `top:15, left:15, right:15`, 높이 `50px`, `z:20`.
- 글래스(`rgba(255,255,255,0.85)`, blur 12px), `border-radius:20px`, 갈색 그림자, 흰 테두리.
- 내부(좌→우): `🔎` 아이콘박스(40px, 색 brown) · 입력(flex:1, 16px/500, 투명배경, dark 텍스트) · 구분선(1px, 높이20, `rgba(141,110,99,0.2)`) · **EN/한 토글**(34px, 13px/800, brown) · 구분선 · **⚙️ 필터버튼**(48px, 20px) — 우상단에 **필터 뱃지**(8px 원, `--urgent-color`, glow, 활성 필터 있을 때만 표시).
- placeholder: `팀명, 지역으로 검색...` / EN `Search by team or area...`.

### 2.2 탭 바 `.tab-bar`
- 위치: `top:70`, 가로 중앙(`left:50% + translateX(-50%)`), `z:19`.
- pill 컨테이너: 글래스, `border-radius:16px`, padding 4px, 그림자.
- 탭 버튼 `.tab-btn`: padding `7px 22px`, `13px radius`, 14px/800. 비활성 글자 `#9e8e84`.
- 활성 `.active`: 배경 옐로, 글자 dark, 그림자 `0 2px 8px rgba(250,199,16,0.4)`.
- 항목: `동호회`(clubs) / `픽업`(pickup). EN: `Clubs` / `Pickup`.

### 2.3 급구 티커 `.urgent-ticker-bar`
- 위치: `top:116`(탭바 아래로 내려감), 양옆15, 높이 `44px`, `z:18`.
- 배경 `rgba(255,251,240,0.85)` blur10, 테두리 `1px rgba(255,112,67,0.3)`(연 오렌지), `radius:16px`, 작은 그림자.
- 좌측 `🔥` 아이콘(18px, `pulse` 애니메이션). 우측은 세로 스크롤되는 한 줄 목록(아이템 높이 44px, 14px/600). 팀명은 `<b>` 로 `#d84315` 강조.
- **기본 `display:none`** — 급구 클럽 있을 때만 노출. (동작: [01-map](./flutter/01-map.md) 티커 섹션.)

### 2.4 플로팅 버튼 (FAB)
모두 글래스 + spring 누르기(`scale(0.9)`).

| 버튼 | 위치 | 크기/모양 | 내용 |
|---|---|---|---|
| 🍱 도시락 `.fab-lunchbox` | left:15, bottom:95 | 50×50, radius20, 26px | 도시락 오버레이 열기 |
| 🍚 프로필 `.fab-profile` | left:15, bottom:30 | **55×55**, radius24, 30px | 프로필 카드 토글 |
| 📝 급구등록 `.fab-urgent`(그룹 상단) | right:15, bottom:30↑ | 50×50, radius20, 24px | **배경 `--urgent-color`/흰글자**, 오렌지 그림자 — 팀 등록 |
| 📍 내위치 `.fab-btn`(그룹 하단) | right:15, bottom:30 | 50×50, radius20, 20px | 내 위치로 이동 |

> `.fab-group` 은 우하단 세로 스택(gap 12px). 픽업 탭에서는 📝(급구등록)과 ⚙️(필터), 🔥 티커가 숨고 대신 픽업 리스트 패널 헤더의 "픽업 등록" 버튼이 그 역할을 한다. (탭별 chrome 토글 → [08-pickup](./flutter/08-pickup.md).)

---

## 3. 지도 & 마커

(시각만. 클러스터 임계값·라벨 줌 로직은 [01-map](./flutter/01-map.md).)

- **초기 뷰**: 서울 중심 `(37.5665, 126.9780)`, Kakao level **12**. (Flutter에서 동일 중심/줌 환산.)
- **일반 마커**: `assets/marker_yellow.png` (40×53px, 앵커 = 중앙 하단). 노란 물방울 핀.
- **급구 마커**: `assets/marker_red.png` (빨강). 항상 지도에 직접 표시(클러스터에 안 들어감), 위로 떠 보이게 z 최상.
- **클러스터 원**: 지름 40px, 배경 `#fac710`, 글자 검정 bold 14px, 원형, 그림자 `0 2px 6px rgba(0,0,0,0.3)`. 숫자(묶인 개수) 중앙.
- **내 위치 마커**: 동심원 SVG — 바깥 `rgba(66,133,244,0.3)` r45, 흰 r25, 파랑 `#4285F4` r20. (구글 GPS 점 느낌.)
- **마커 라벨** `.label`: 흰 pill, padding `6px 12px`, radius20, 12px/800, 글자 `#333`, 그림자, `translateY(-55px)`(핀 위로 띄움). hover시 살짝 확대.
  - 급구 라벨 `.label.urgent`: 배경 `--urgent-color`, 흰 글자, **흰 2px 테두리**, `pulse` 애니메이션. 앞에 `🔥` 텍스트.
  - 픽업 라벨 `.label.pickup-label`: **틸 2px 테두리** `#13a89e`, 글자 `#0b6b64`.
- **인증 뱃지**: 라벨/타이틀 앞 트위터식 파란 체크 SVG(`#1DA1F2`). (위상이 아니라 "실재 확인" 신호 — 랭킹 아님.)

> Flutter: 카카오맵 SDK(또는 채택한 지도)의 커스텀 마커로 PNG 마커 + 커스텀 오버레이(라벨)를 재현. `pulse`는 마커 위젯에 반복 스케일/그림자 애니메이션.

---

## 4. 클럽 상세 바텀시트 `.bottom-sheet`

> 동호회 탭의 핵심 화면. (드래그/모핑 동작 = [02-club-detail](./flutter/02-club-detail.md).)

**컨테이너**: 화면 하단 고정, 풀폭. 배경 `rgba(255,255,255,0.95)` blur20, 상단 라운드 `32px`, 위쪽 그림자 `0 -8px 30px rgba(0,0,0,0.08)`. 세로 flex. 높이는 상태에 따라 0/390px/90vh.

**구조(위→아래)**:
1. **핸들 영역** `.sheet-handle-area`: 가운데 회색 바(44×5px, `#e0e0e0`, radius3). 드래그 핸들.
2. **급구 영역** `#urgentArea`: 급구일 때만 `.urgent-banner` — 배경 `#fff3e0`, 테두리 `#ffcc80`, 글자 `#e64a19`, radius12, 13px/700, `🔥 {메시지}`.
3. **헤더** `.sheet-header`: 좌측 타이틀(19px/800, `#111`, 인증뱃지+이름+인스타 아이콘) · 우측 **🍱 북마크 버튼**(24px).
4. **타임 모프 컨테이너** `.time-morph-container` (탭/드래그로 요약↔전체 전환):
   - **요약** `.summary-content`: 가로 스크롤되는 `.st-bubble` 칩들. 각 버블 = 흰 배경 + **옐로 2px 테두리** + radius12, 위에 요일(11px/800, `#f57f17`), 아래 시간(12px/700). 일정 없으면 "일정 정보 없음" 버블 1개.
   - **전체** `.full-content`: 주간 시간표 그리드 `.ft-container`(흰 카드, radius16, 테두리 `#d7ccc8`). 헤더행(시간열 50px + 월~일 7열, 높이35, 하단 brown 2px 보더, 배경 `#efebe9`). "오늘" 열은 `--today-color` 배경/흰글자. 본문은 시간 라벨 열 + 요일 열들, 일정은 `.ft-event-block`(절대배치, 폭94%, 배경 `#fff9c4`, 좌측 옐로 4px 바, radius6).
5. **태그박스** `.tag-box`: `.tag`(11px/600, 배경 `#efebe9`, 글자 `#5d4037`, radius8). 대상 태그 `.tag.target` 은 오렌지(`#e65100`/`#fff3e0`).
6. **가격 행** `.info-row`: `💰` + 가격 텍스트(13px). 없으면 "수수료 없음".
7. **액션 버튼** `.action-buttons` (가로, flex, gap8):
   - `📍 주소 복사` `.btn-copy`(회색 `#eceff1`/`#455a64`)
   - `🚀 길찾기` `.btn-way`(**옐로**, dark 글자, 옐로 그림자) — 카카오맵 길찾기 링크
   - `🔗 공유` `.btn`(기본)
8. **인스타 임베드** `#clubReelEmbed` `.insta-embed-box`: 릴스/게시물 있을 때만. 가운데 정렬, max-width 360px.
9. **확장 힌트** `.expand-hint`: `▴ 위로 올려서 상세 정보 보기` (11px, `#bdbdbd`).
10. (관리 권한 시) 급구 토글/인증신청/수정/삭제 버튼이 동적으로 삽입됨 → [02-club-detail](./flutter/02-club-detail.md).

---

## 5. 필터 시트 `.filter-sheet`

> 검색바 ⚙️ → **위에서 아래로** 내려오는 시트(상세시트와 반대 방향).

- 컨테이너: `top:0` 풀폭, `max-height:85%`, 배경 `rgba(255,255,255,0.95)` blur20, **하단 라운드 `0 0 32px 32px`**, `transform: translateY(-100%)` → 열리면 `0`. 이징 `cubic-bezier(0.2,0.8,0.2,1)` 0.4s.
- **헤더** `.fs-header`: 제목 `검색 조건 설정`(22px/800, dark).
- **본문** `.fs-body` (스크롤): 3개 섹션, 각 `.fs-section`(margin-bottom 25px), 라벨 `.fs-label`(15px/700, brown):
  - `📍 지역 (중복 선택 가능)` — 서울/경기/인천/강원/충청/전라/경상/제주
  - `📅 요일` — 월~일
  - `🏐 대상 및 특징` — 성인/대학생/청소년/여성전용/남성전용/선출가능/**6인제**
  - 영어 모드 힌트 `.fs-en-hint`(한국어 모드 `display:none`): 옐로 좌측바 박스. *"New to Korea? Most international players look for 6s — tap it above."*
- **칩** `.chip`: padding `10px 18px`, radius20, 테두리 `rgba(141,110,99,0.3)`, 배경 `rgba(255,255,255,0.8)`, 14px/600, 글자 `#5d4037`. hover 크림. **선택 `.selected`**: 배경 옐로, dark 글자, 옐로 테두리+그림자, 800. 누르면 `scale(0.95)`.
  - 영어 모드: `#targetChips .chip-6s` 가 `order:-1`(맨 앞) + brown 테두리 + 앞에 `🏐 `.
- **푸터** `.fs-footer`: `초기화`(`.btn-reset`, flex0.3, 연회색) · `적용하기`(`.btn-apply`, flex1, **dark 배경/흰 글자**).
- **하단 핸들** `.fs-handle-area`: 회색 바(44×5, `#bdbdbd`). 위로 드래그하면 닫힘.

---

## 6. 도시락 오버레이 `.lunchbox-overlay` (북마크)

> 🍱 FAB → 가운데 모달. (식단표 생성/편집 동작 = [04-lunchbox](./flutter/04-lunchbox.md).)

- **오버레이**: 풀스크린, 배경 `rgba(93,64,55,0.35)`(갈색 반투명) + blur6, `fadeIn`. 가운데 정렬.
- **카드** `.lunchbox-wrapper`: 폭 340px, 크림 글래스(`rgba(255,248,225,0.85)` blur16), radius28, padding `20px 15px`, 큰 갈색 그림자, max-height 90vh, 세로 flex(gap12).
- **헤더** `.lb-header`: 좌 `도시락 🍱`(20px/800) · 우 버튼그룹 — `🍙 직접추가`(`.lb-add-btn`, 크림배경) · `🍽 편집`(`.lb-edit-btn`). 편집 ON `.editing` 이면 배경 `#ff7043`/흰글자.
- **도시락 그리드** `.lunchbox-grid`: **5칸을 도시락처럼 배치한 핵심 비주얼.** 높이 220px, `grid-template-columns: repeat(6,1fr)`, `rows: 0.8fr 1.2fr`, gap6.
  - 배치(밥/국 한 줄, 반찬 윗줄): `slot-2/3/4`(윗줄, 각 2칸 폭) + `slot-0`(아랫줄 3칸=밥) + `slot-1`(아랫줄 3칸=국). → **밥·국이 크고 반찬 3개가 위에 작게.**
  - 셀 `.lb-cell`: 흰 반투명, radius16, 13px/700, 그림자. 채워짐 `.filled` = 흰배경+옐로 2px 테두리. 빈칸 `.empty` = 점선 테두리+크림, 회색 글자(슬롯 이름: 밥/국/반찬1/2/3). 편집 선택 `.selected` = 오렌지 2px 테두리+`#ffecb3`.
  - 편집모드 삭제 버튼 `.lb-del-btn`: 우상단 빨강 원(24px, `#ff5252`, 흰테두리).
- **식단표 버튼** `.diet-toggle-btn`: `📅 식단표 (스케줄 확인)`, 풀폭, brown 배경/흰글자, radius16.
- **식단표 컨테이너** `.diet-plan-container`: 높이 0→(열림 시) 펼침, 이징 0.4s. 주간 그리드(요일×시간) — 북마크한 팀들의 일정을 슬롯별 색으로 겹쳐 표시. 슬롯 색 `["#fffde7","#fff3e0","#f1f8e9","#fbe9e7","#f3e5f5"]`, 좌측 보더색 `["#fbc02d","#f57c00","#689f38","#d84315","#8e24aa"]`.

---

## 7. 프로필 오버레이 `.profile-overlay` (네임카드)

> 🍚 FAB → 가운데 카드. 로그인 상태에 따라 두 얼굴.

- 오버레이: 도시락과 동일(갈색 반투명+blur6, fadeIn). 카드 밖 탭하면 닫힘.
- **카드** `.profile-card`: 폭 85%/max340, 크림 글래스 blur16, padding `30px 20px`, radius28, 큰 그림자, `slideUp` spring 등장. 좌상단 워터마크 `.pc-rice-type`(밥 종류, 12px, `rgba(93,64,55,0.3)`).

**(A) 비로그인** `#loginSection`:
- `구글로 간편 로그인` `.btn-google-login`(흰 배경, 구글 G 아이콘, 풀폭).
- `또는` `.divider`(양쪽 줄).
- 이메일/비밀번호 입력 `.auth-input`(radius14, 포커스시 옐로 글로우).
- `로그인`(`.btn-auth.primary`, 옐로) / `회원가입`(`.btn-auth.secondary`, 흰).

**(B) 로그인** `#profileContent`:
- 헤더: 닉네임 `.pc-nickname`(24px/800, **밥 닉네임** 예: `백미밥-a3x`) + `🥢` 편집버튼(원형).
- 가입일 `.pc-date`(13px, brown, `가입일: YYYY.M.D`).
- 구분선 `.pc-divider`(40% 폭, brown 20%).
- 메인팀 `.pc-main-team`(18px/700, 흰 pill, inset 그림자) — 첫 찜한 팀(없으면 "찜한 팀이 없어요").
- 푸터 `.pc-footer`(가로): `로그아웃`(`.btn-logout`, 연회색) · `🎁 포장하기`(`.pc-share-btn`, **brown 배경/흰글자**) — 공유 카드 생성.
- **카드 배경색이 밥 종류 색으로 바뀜**(닉네임의 밥 색). 로그아웃 시 기본 `#fff9c4` 로 리셋. (밥 닉네임/색 로직 = [05-profile-auth](./flutter/05-profile-auth.md).)

---

## 8. 팀 등록 모달 `#regModalOverlay`

> 📝 FAB → 풀스크린 위 모달. (검증/지도선택/제출 = [06-registration](./flutter/06-registration.md).)

- 오버레이: `rgba(255,255,255,0.4)` + blur10, `z:10000`, 가운데.
- 콘텐츠 `.reg-modal-content`: 90%/max400, `rgba(255,255,255,0.85)`, radius20, max-height 85vh, 세로 flex.
- 헤더 `.reg-modal-header`: 제목 `팀 등록하기`(18px) + `×` 닫기.
- 본문 `.reg-modal-body`(스크롤):
  - **tip 박스**: 옐로 좌측바(`rgba(255,193,7,0.1)` / `#ffc107`), 13px. *요일별 체육관 다르면 장소별로 각각 등록.*
  - 필드 그룹 `.reg-form-group`(label 13px/500 `#666` + 입력): 팀 이름(필수) · **대상(필수, 칩 다중)** + 기타조건 입력 · **주소(필수)** + `지도에서 찾기` 버튼(흰 배경, brown 테두리) · **운동 시간(스케줄 블록)** + `＋ 시간대 추가` · 회비 · 인스타 핸들 · 릴스 링크 · 가입/문의 링크.
  - 입력 `.reg-form-group input`: 흰 반투명, 테두리 `#e0e0e0`, radius10, 12px padding, 포커스 brown 테두리.
  - 스케줄 블록 `.sched-block`: 흰 반투명 카드 radius14 — 요일 7칩(균등폭 `.sched-day-chip`) + 시작/끝 시간 `<select>`(커스텀 화살표) + 삭제버튼(오렌지 톤). `＋ 시간대 추가` `.sched-add-btn`(점선 테두리, brown).
  - (관리자만) `#adminOwnerGroup`: 빨강 좌측바 경고 박스, 소유자 이메일 지정.
  - 제출 `.reg-submit-btn`: 풀폭, **brown 배경/흰글자**, radius12, 16px/600. 비활성 시 회색.

> **픽업 등록 모달 `#pkModalOverlay`** 은 동일한 `.reg-modal-*` 스타일을 재사용한다. 종목(6인제/9인제/혼성)·레벨(입문/중급/고급/무관) 단일선택 칩 `.pk-chip`, `초보 환영`·`🌐 외국인 환영(English OK)` 토글 칩, 장소/주소/일정/이번주공지/게임비/단톡링크/릴스/추가안내 필드. (동작 = [08-pickup](./flutter/08-pickup.md).)

---

## 9. 지도에서 위치 선택 (Map Picker) `#mapPickerOverlay`

- 등록 모달의 `지도에서 찾기` → 모달 숨고 풀스크린 맵피커.
- 화면 **정중앙 고정 핀**: `assets/marker_yellow.png` 40px, opacity 0.6, 그림자. (지도를 움직여 핀을 원하는 곳에 맞추는 방식 — 핀은 안 움직이고 지도가 움직임.)
- 하단 버튼: `이 위치로 주소 설정`(brown pill, 800) · `취소`(흰 pill). → 중앙 좌표를 역지오코딩해 주소 입력에 채움.

---

## 10. 픽업(Pickup) 화면들

> 동호회와 **틸(teal)** 색으로 구분. (데이터/동작 = [08-pickup](./flutter/08-pickup.md).)

### 10.1 픽업 리스트 패널 `.pickup-list-panel`
- 하단 도킹, 풀폭, 높이 `46vh`, 배경 `rgba(255,255,255,0.96)` blur20, 상단 라운드24, 위 그림자. `z:15`.
- 헤더 `.pl-header`: 좌 `여기서 픽업이 열려요`(16px/800) · 우 `🌐 English OK` 토글(`.pl-en-toggle`, 켜짐 `.on` = 파랑 `#2b50aa` 배경) + `픽업 등록`(`.pl-host-btn`, 옐로).
- 본문 `.pl-body`(스크롤, 하단 84px 여백): 카드 `.pl-item`(흰, 테두리 `#f0ece2`, radius16):
  - (있으면) **이번주** 배지 줄 `.pl-thisweek`.
  - 🗓 일정 / 메모.
  - 타이틀 `.pl-item-title`(15px/800).
  - 메타 칩 `.pl-meta`: 종목(파랑) · 레벨 · 초보환영(초록) · English(파랑) · `📍 장소`.
  - 게임비 `.pl-spots`.
- 비었을 때 `.pl-empty`: 가운데 회색 안내.

### 10.2 픽업 상세 바텀시트 `.pickup-sheet`
- 하단 시트, `max-height:82vh`, 배경 `rgba(255,255,255,0.98)` blur20, 상단 라운드28, `z:210`. `translateY(100%)`→열리면 `0`, 이징 `cubic-bezier(0.2,0.8,0.2,1)` 0.3s. (`.open` 클래스로 제어.)
- 핸들(틸 회색 바) + 콘텐츠 `.ps-content`:
  - 타이틀 `.ps-title`(20px/800) + 태그 `.ps-tags`.
  - (있으면) **이번주** 공지 `.ps-thisweek`.
  - 일정(🗓) / 메모(📝).
  - 위치(📍 장소명 굵게 + 주소) + `📍 주소 복사` 미니버튼.
  - 게임비(💰).
  - **`💬 단톡 들어가기`** `.ps-pay-btn`(틸 `#13a89e`/흰글자) — 연락 링크.
  - 공유 행 `.ps-share-row`: `📸 스토리`(옐로) + `🔗 링크`.
  - 메모 `.ps-notes`(연회색 박스).
  - 인스타 임베드.
  - (호스트 본인만) 수정/삭제 `.ps-host-controls`(옐로/빨강).

---

## 11. 공유 — 카드 캡처 & 메뉴

> "🎁 포장하기" / "📸 스토리". (캡처·QR·딥링크·네이티브 브리지 = [07-share](./flutter/07-share.md).)

### 11.1 공유 액션시트 `.share-menu`
- 하단에서 올라오는 시트(`shareMenuUp 0.2s`), 흰 배경, 상단 라운드24, safe-area 패딩.
- 제목 `공유 방법` + 항목 `.share-menu-item`(연회색 라운드 버튼; primary는 옐로): `📸 스토리`(+힌트) · `💬 카카오` · `🔗 링크 복사` · `📤 더보기`(navigator.share) · `취소`.

### 11.2 스토리 카드 (1080×1920)
캔버스로 직접 그리는 인스타 스토리용 세로 카드. 레이어: 크림 그라데이션 배경 + 점 텍스처 → 로고/브랜드 → 지도 일러스트 패널(추상 동네 블록 + 강 + 핀 + 가까운 지하철역 칩) → 정보 카드(타이틀·태그칩·이번주·🗓💰📍 행) → QR(250px) + CTA + URL. 클럽은 옐로 액센트, 픽업은 틸.

### 11.3 포장하기 카드 (프로필+도시락)
- **스토리 모드** `.capture-mode-story`(1080×1920): 네임카드+도시락 세로 배치, 점 패턴 배경.
- **피드 모드** `.capture-mode-feed`(1600×1200): 좌측 네임카드+도시락 / 우측 주간 식단표, brown 25px 테두리 프레임.
- 워터마크: 로고 원형 + `누룽지도`.

> Flutter에서는 html2canvas 대신 **위젯을 `RepaintBoundary`로 PNG 캡처**(`toImage`)하거나, 스토리 카드는 `CustomPainter`로 동일 레이아웃을 직접 그린다. 치수(1080×1920, 1600×1200)와 색은 그대로.

### 11.4 프리뷰 오버레이 `.preview-overlay`
- 검정 반투명(0.85) 풀스크린. 가운데 생성 이미지(`object-fit:contain`) + 하단 `닫기`/`💾 저장하기`(옐로).

---

## 12. 영어 모드(i18n) 시각 규칙

> 텍스트 사전/변환 로직은 [09-i18n](./flutter/09-i18n.md). 여기선 **레이아웃 영향**만.

- `body.lang-en` 토글로 영어 전용 규칙 활성:
  - 6인제 칩 맨 앞 + `🏐` 프리픽스 + 강조(§5).
  - 필터 영어 힌트 박스 표시(§5).
  - 영어 라벨이 길어 도시락 헤더/버튼 폰트·패딩 축소(`lb-header` 17px 등), 칩·버튼 `white-space:nowrap` 강제(줄바꿈 방지).
- → **Flutter**: 영어일 때 동일하게 (a) 6s 우선·강조, (b) 힌트 노출, (c) 긴 라벨 버튼 폰트 다운스케일 + 한 줄 유지(`maxLines:1` + `FittedBox`/오토사이즈) 처리.

---

## 13. Flutter 이식 체크리스트 (디자인)

- [ ] `AppColors`/`AppRadius`/`AppSpacing`/`AppShadows`/`AppMotion` 토큰 클래스로 §1 박제 (특히 **갈색 그림자**).
- [ ] Pretendard 폰트 번들 + 기본 테마. 한글 타이틀 letter-spacing -0.5.
- [ ] 공용 `GlassSurface` 위젯(BackdropFilter+반투명+흰테두리) — 검색바/FAB/시트/패널 공통.
- [ ] 공용 `BounceTap`(누르면 scale 0.9~0.98) — 모든 탭 요소.
- [ ] 3종 모션 커브(easeOutBack / Cubic(0.2,0.8,0.2,1) / linear)만 사용.
- [ ] 바텀시트: 클럽(아래서) vs 필터(위에서) 방향 구분. 라운드 28~32.
- [ ] 도시락 5칸 그리드 비대칭 배치(밥/국 큰 2칸 + 반찬 3칸) 정확 재현.
- [ ] 마커 3종(노랑/빨강 급구 pulse/틸 픽업) + 클러스터 옐로 원 + GPS 동심원.
- [ ] 동호회=옐로 / 픽업=틸 색 분리 일관 유지.
- [ ] 영어 모드 레이아웃 규칙(§12).
- [ ] safe-area/노치 인셋 처리(viewport-fit=cover 대응).
- [ ] **랭킹/별점/순위 UI는 절대 추가하지 않는다**(노스스타 §0-1).
