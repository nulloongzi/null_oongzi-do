# 안치기 사양 (웹 · 앱 공통)

> **웹**: `anchigi.html` (단일 파일, Vanilla JS)
> **앱**: `null_oongzi-do-app` 의 `lib/**/anchigi/**` (Flutter, 이식 완료)
> **작성일**: 2026-08-24 · **갱신**: 2026-09-18 (6 · 9인제, 고정, 빈 자리)
>
> 두 구현의 규칙은 같아야 한다. 한쪽만 고치지 말 것.

---

## 1. 기능 요약

안치기는 배구 동호회 현장에서 **참석자 명단 + 가능 자리**만 넣으면 라운드별 팀 배치를 즉석에서 뽑아주는 도구다.

- 종목 구분: **6인제**(로테이션 · 5-1 / 6-2 전술) / **9인제**(속공 수별 포메이션)
- 명단 관리 (이름, 자리 티어, 참석/퇴장 시간, 고정 📌)
- 라운드 배치 뽑기 (CSP 백트래킹 + 공정성 점수)
- ABC 고정 모드 / 자유 편성 모드
- 배치 우선순위 2단계 (맞춘 자리 우선 / 다양성 우선) + 실험 자리 수
- 인원이 모자라면 막지 않고 **빈 자리를 (필요)로 표시**
- 누적 기록으로 출전/대기/자리 분배 균등화, 모임 단위 보관 · 백업
- KO/EN 2개 언어

---

## 2. 데이터 모델

### Player

```dart
class Player {
  final String id;       // "p" + base36Counter + "-" + randomBase36
  String name;
  Map<String, String> tier;  // { "S": "main", "CC": "sub", ... } 두 종목 자리를 한 맵에
  bool here;             // 참석 여부
  String? leave;         // 퇴장 시간 "HH:MM" or null
  Map<String, String> pin;   // { "v6": "S" } 종목별 고정 자리
  int? pinTeam;          // 0=A, 1=B, 2=C. null이면 자동
  String sport;          // 지금 보고 있는 종목 — pos/tier 판정이 여기 따라간다

  // 파생: 이 종목에서 설 수 있는 자리. 하나도 안 골랐으면 전 자리('어디든')
  List<String> get pos;
  bool get isFlex;       // 이 종목 자리를 하나도 안 고른 상태
}
```

**티어 값**: `main`(주), `sub`(가능), `want`(도전). 키가 없으면 안 고른 것.

**'어디든'**: 이 종목 자리를 하나도 안 고르면 모든 자리를 주 자리로 친다.
(예전엔 세터를 자동으로 박아 넣어, 이름만 넣고 시작하면 전원 세터 전용이 됐다.)

**고정(📌)**: 진행하는 사람이 자리 · 코어를 직접 지정하는 하드 제약.
실력 등급이 아니라 사람이 고르고 지정하는 값이다 (`docs/PHILOSOPHY.md` 랭킹 금지).
다 지킬 수 없으면 풀고 뽑은 뒤 그 사실을 알린다.

### PlayerStat

```dart
class PlayerStat {
  int play = 0;          // 누적 출전 횟수
  int bench = 0;         // 누적 대기 횟수
  Map<String, int> pos;  // { "S": 3, "OP": 1, ... } 포지션별 배정 횟수
}
```

### 전체 상태

| 변수 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `players` | `List<Player>` | `[]` | 전체 명단 |
| `stat` | `Map<String, PlayerStat>` | `{}` | id별 누적 기록 |
| `round` | `int` | `1` | 현재 라운드 번호 |
| `pastRounds` | `List<RoundRecord>` | `[]` | 확정된 라운드 기록 |
| `nGames` | `int` | `3` | 라운드당 경기 수 |
| `mode` | `String` | `"abc"` | `"abc"` 또는 `"free"` |
| `sport` | `String` | `"v6"` | `"v6"`(6인제) 또는 `"v9"`(9인제) |
| `prio` | `String` | `"custom"` | `custom`(맞춘 자리) 또는 `variety`(다양성) |
| `flexSlots` | `int?` | `null` | 팀당 실험 자리. null이면 우선순위 기본값 |
| `allowed` | `List<String>` | 전체 | 허용된 팀 구성 |
| `meets` | `List<Meet>` | `[]` | 보관한 지난 모임 |
| `compact` | `bool` | `false` | 결과를 코트 대신 목록으로 |
| `schedule` | `Schedule` | 아래 참조 | 시간 설정 |
| `current` | `RoundResult?` | `null` | 아직 확정 안 된 뽑기 결과 |

### Schedule

```dart
class Schedule {
  String start = "13:00";    // 운동 시작
  String warmup = "14:00";   // 게임 시작
  String end = "17:00";      // 운동 종료
  int perGame = 15;          // 경기당 분
  int rest = 10;             // 라운드 휴식 분
}
```

---

## 3. 팀 구성 템플릿

자리 하나 = `{ p: 역할, z: 6인제 존, l: 자리 이름, off: 코트 밖 }`.
`p` 는 명단에서 고르는 역량 키고, `z`/`l` 은 코트에 어디로 그릴지다.

### 6인제 — 전술로 갈린다

| 전술 | id | 인원 | 자리(존) |
|------|----|------|----------|
| 5-1 | `mb2` | 6 | S(1) · OP(4) · OH(2) · OH(5) · MB(3) · MB(6) |
| 5-1 | `mb1li` | 6 | S(1) · OP(4) · OH(2) · OH(5) · MB(3) · Li(6) |
| 5-1 | `mb2li` | 7 | 위 + Li(코트 밖, 후위 센터와 교대) |
| 6-2 | `mb2x62` | 6 | S(1) · **S(4 · 라이트)** · OH(2) · OH(5) · MB(3) · MB(6) |
| 6-2 | `mb1lix62` | 6 | S(1) · S(4 · 라이트) · OH(2) · OH(5) · MB(3) · Li(6) |
| 6-2 | `mb2lix62` | 7 | 위 + Li(코트 밖) |

5-1 은 세터 한 명이 여섯 자리를 다 돈다. 6-2 는 세터 둘이 후위에서 번갈아 토스하고,
전위 세터는 라이트 자리에서 공격한다. 대각 규칙: S↔OP, OH↔OH, MB↔Li(or MB).

### 9인제 — 속공 수로 리시브 줄이 갈린다

로테이션이 없다. 속공을 몇 명 두느냐가 줄 구성을 정한다.

| id | 속공 | 줄 | 앞줄 | 가운데 | 뒷줄 |
|----|------|----|------|--------|------|
| `v9q1` | 1 | 2-4-3 | 속공 · 세터 | 레프트 · 앞차 · 빽차 · 라이트 | 레프트백 · 백센터 · 라이트백 |
| `v9q2` | 2 | 3-4-2 | 앞속공 · 세터 · 빽속공 | 레프트 · 앞차 · 빽차 · 라이트 | 레프트백 · 센터백 |
| `v9q3` | 3 | 4-3-2 | 앞B · 앞A · 세터 · B | 레프트 · 차 · 라이트 | 레프트백 · 라이트백 |

수비 전환(코트 아래 메모로 표시):

- 속공 2 — 앞차 · 빽차 중 한 명이 수비 때 뒤로 빠져 가운데를 보고, 거기서 공격에 들어간다.
- 속공 3 — 차가 수비 때 뒤로 빠져 가운데를 보고, 거기서 공격에 들어간다.

**명단은 역할 6종만 고른다** — 세터(`S9`) · 속공(`QK`) · 레프트(`L9`) · 라이트(`R9`) ·
차(`CH`) · 백(`BK`). 포메이션마다 자리 이름이 달라 열세 개를 다 고르게 하면 입력이 무너지고
기록도 흩어진다. 구체적인 자리 이름은 코트에만 표시한다.

## 4. 배치 우선순위 (Priority)

| 키 | flex | fitW | varietyW | newBonus | playW | balanceW |
|----|------|------|----------|----------|-------|----------|
| `custom` (맞춘 자리 우선) | 1 | 2.4 | 0.7 | 0.5 | 1.5 | 6.0 |
| `variety` (다양성 우선) | 3 | 0.7 | 2.6 | 4.0 | 1.0 | 2.0 |

예전 게임 성격 4단계는 저장본 마이그레이션으로 흡수한다:
`comp → custom/0`, `real → custom/1`, `mix → variety/2`, `exp → variety/5`.

- `flex`: 팀당 최대 비주 자리 수 기본값 (하드 제약, 사용자가 덮어쓸 수 있다)
- `fitW`: 포지션 적합도 가중치
- `varietyW`: 포지션 반복 패널티
- `newBonus`: 새 포지션 보너스
- `playW`: 출전 횟수 가중치
- `balanceW`: 팀 간 적합도 균형 가중치

---

## 5. 핵심 알고리즘: 배치 뽑기

### 5.1 전체 흐름

```
solveRound(present, nGames)
├── mode === "abc" → solveRoundABC
│   ├── makeCores() → A, B, C 코어 분할
│   ├── game 1: A vs B (C에서 차출)
│   ├── game 2: B vs C (A에서 차출)
│   └── game 3: C vs A (B에서 차출)
└── mode === "free" → solveRoundFree
    ├── game 1: 전원에서 2팀 뽑기
    ├── game 2: 전원에서 2팀 뽑기 (앞 경기 반영)
    └── game 3: ...
```

### 5.2 백트래킹 탐색 (CSP)

**입력**:
- `present`: 이 경기에 참가 가능한 선수 목록
- `slots`: `[{ team: 0|1, pos: "S"|"OP"|..., allow: [...] }]` — 채울 자리 목록
- `must`: ABC 모드에서 반드시 해당 팀에 넣어야 할 선수
- `slotBudget`: 팀당 비주 포지션 최대 수

**알고리즘**:
1. **MRV 휴리스틱**: 채울 수 있는 후보가 가장 적은 슬롯부터 채운다
2. **적격성 검사**: 포지션 가능 여부 + 코어 제약 + 비주 예산
3. **후보 정렬**: `slotCost()` + 랜덤 jitter → 확률적으로 다른 결과
4. **가지치기**: must 제약을 남은 슬롯으로 충족 불가능하면 포기
5. **다중 시도**: 유효해 1개 찾은 뒤 ~60회 추가 시도, 최저 비용 채택

### 5.3 공정성 점수 (slotCost)

```
cost = play * playW                    // 많이 뛰면 뒤로
     + (2 - fitOf(tier)) * fitW        // 비주 자리면 비용↑
     - (자리수 - nOptions) * 1.0       // 가능 자리 적은 사람 우선
     - 5.0 (if leaving early)          // 일찍 가는 사람 우선
     - 9.0 (if pinned to this seat)    // 고정한 자리면 크게 깎는다
     + posCount * varietyW             // 같은 자리 반복 패널티
     - newBonus (if new seat)          // 새 자리 보너스
     + setter overuse penalty          // 세터 전용인데 과다 출전(6인제)
```

**benchCost**: 대기 비용
= `(avgPlay - play) * 3.5 + bench * 4.0 + benchStreak * 9.0
   + (early ? 10.0 : 0) + (pinned ? 9.0 : 0)`

`benchStreak`는 **이번 라운드 안에서 연달아 쉰 횟수**다(뛰면 0으로 돌아간다).
연속 대기를 막는 장치이고, 설명 탭이 약속하는 동작이다.

**팀 간 균형**: `|fitAvg_team0 - fitAvg_team1| * balanceW * 6`

### 5.4 예산 완화

실험 자리 수로 시작, 실패하면 +1씩 올려 최대 9까지. 완화됐으면 UI에 알림.

### 5.5 인원이 모자랄 때 — 빈 자리 (필요)

못 뽑는다고 막지 않는다. 한 경기의 자리 수보다 사람이 적거나 아무도 못 서는 자리가
있으면, 그 자리를 비운 채로 배치를 내고 코트에 **(필요)** 로 표시한다.
어떤 자리를 더 구해야 하는지 보이게 하는 것이 목적이다.

- `emptyAllowance = (자리 수 - 인원) + (아무도 못 서는 자리 수)` 만큼만 비울 수 있다.
  채울 수 있는 자리는 반드시 채워진다.
- 탐색은 2패스다. 1차는 빈자리 0으로, 실패하면 2차에서 허용한다.
  (예산 완화 사다리를 빈자리가 가로채지 않게 하려는 것.)
- 빈자리 하나당 비용 40, 두 팀 간 빈자리 차이에도 비용을 건다 — 한쪽만 텅 비지 않게.
- MRV 타이브레이크는 **저수지 표집**으로 균등 무작위여야 한다. 앞에서부터 고르면
  팀 A 자리가 먼저 차서 빈자리가 한쪽에 몰린다.
- A · B · C 모드는 참석이 팀 인원의 2~3배가 아니면 **자유 편성으로 내려간다**(알림).

---

## 6. ABC 모드 상세

### 코어 분할 (makeCores)

1. 선수를 포지션 유연성 오름차순 정렬 (적은 사람 먼저)
2. 세터 과다 출전자는 뒤로
3. A → B → C 순서로 할당, 각 코어가 템플릿을 충족하는지 이분매칭으로 확인
4. A, B는 정확히 T명, C는 나머지 (n - 2T)명
5. 참석 인원 제약: `2T ≤ n ≤ 3T`

### 경기 순서

| 경기 | 팀 1 | 팀 2 | 차출 풀 |
|------|------|------|---------|
| 1 | A | B | C |
| 2 | B | C | A |
| 3 | C | A | B |

코어 선수는 자기 팀 경기에 반드시 출전. 모자란 자리는 차출 풀에서 빌려옴.

---

## 7. 스케줄 계산

```dart
int gameStartMin(int rnd, int gi) =>
  parseTime(warmup) + ((rnd - 1) * nGames + gi) * perGame + (rnd - 1) * rest;

int gameEndMin(int rnd, int gi) =>
  gameStartMin(rnd, gi) + perGame;

int maxRounds() {
  int total = parseTime(end) - parseTime(warmup);
  int perRound = nGames * perGame + rest;
  return (total + rest) ~/ perRound;  // rest 한 번 보정
}
```

`leave` 시간이 `gameEndMin` 이전인 선수는 해당 경기에서 제외.

---

## 8. 저장소

### 웹: localStorage / 앱: SharedPreferences

키 패턴: `anchigi.{name}.v1` (이전 `gvt.{name}.v1`에서 마이그레이션 포함)

키: `players` `stat` `round` `past` `ngames` `mode` `tpl` `schedule`
`sport` `prio` `flex` `meets` `compact` (옛 `feel` · `priority` 는 읽기 전용 마이그레이션)

### 모임 보관 · 백업

- **모임 보관**: 누적 기록 · 확정 라운드를 `meets` 로 옮기고 1R부터 새로 시작. 명단은 남는다.
- **백업**: 명단 · 기록 · 모임 · 설정을 한 JSON 으로 내보내고 불러온다.
  웹은 파일 다운로드/업로드, 앱은 공유 시트/붙여넣기.

---

## 9. i18n

| 방식 | 설명 |
|------|------|
| `L(key)` | 키 → 현재 언어 문자열. 없으면 ko 폴백, 그래도 없으면 키 자체 반환 |
| `data-i18n` 속성 | 정적 요소에 사용 (탭 이름, 뒤로 버튼 등) |
| 함수형 키 | `dg_short(mc, n)` 등 — 파라미터가 필요한 진단 메시지 |

Flutter에서는 `flutter_localizations` + ARB 파일 또는 간단한 Map 기반 구현 추천. 키 약 90개.

---

## 10. UI 구조

### 화면/탭

| 탭 | 내용 |
|----|------|
| 배치 (0) | 스케줄 설정, 게임 설정, 뽑기 버튼, 결과 표시, 과거 라운드 |
| 명단 (1) | 선수 목록 (참석 토글, 포지션 티어 편집, 퇴장 시간), 추가 폼 |
| 기록 (2) | 누적 출전/대기/포지션별 통계 테이블, 초기화 버튼 |
| 설명 (3) | 배치 알고리즘 설명, FAQ |

### UX 패턴 (최근 개선 반영)

1. **접이식 카드**: 스케줄/설정 카드는 `<details>` — 결과가 있으면 자동으로 접혀서 결과가 위로 옴
2. **스크롤 유지**: 뽑기 후 뽑기 버튼 위치로 `scrollIntoView` (맨 위로 튀지 않음)
3. **빈 상태 온보딩**: 명단 0명이면 3단계 안내 + "명단 추가하러 가기" 버튼만 표시
4. **이름 강조**: 아무 패널에서 이름 터치 → 모든 패널에서 같은 선수 하이라이트
5. **포지션 티어 순환**: 터치마다 main → (제거/다른 것 승격) | sub → want → 제거. ☆로 주 포지션 변경

### 코트 렌더링 (Zone 배치)

```
후위    [1:S]  [6:MB] [5:OH]
전위    [2:OH] [3:MB] [4:OP]
```

7인 팀이면 리베로는 코트 밖에 별도 표시 ("후위 센터와 교대").

---

## 11. 상수

```dart
const POS_V6 = ['S', 'OP', 'OH', 'MB', 'Li'];
const POS_V9 = ['S9', 'QK', 'L9', 'R9', 'CH', 'BK'];   // 역할 6종
const TACTICS = ['5-1', '6-2'];                         // 6인제 전술
const TIERS = ['main', 'sub', 'want'];
const FIT = { 'main': 2, 'sub': 1, 'want': 0 };
const PRIOS = ['custom', 'variety'];
const PIN_SLOT_BONUS = 9.0;
const BENCH_STREAK_PENALTY = 9.0;
const EMPTY_SLOT_COST = 40.0;
const PAIRS = [[0,1,2], [1,2,0], [2,0,1]];  // ABC 경기 순서
const TEAM_NAME = ['A', 'B', 'C'];
const EARLY_SLOT_BONUS = 5.0;
const EARLY_BENCH_PENALTY = 10.0;
const SETTER_OVERUSE_N = 1;
```

---

## 12. Flutter 구현 메모 (이식 완료)

### 아키텍처

```
lib/
  features/
    anchigi/
      models/          ← Player, PlayerStat, Schedule, Template, RoundResult
      solver/          ← solveRound, search (CSP), scoring
      state/           ← AnchigiState (Riverpod/Bloc)
      screens/
        anchigi_screen.dart     ← TabBarView 루트
        lineup_tab.dart         ← 배치 탭
        roster_tab.dart         ← 명단 탭
        record_tab.dart         ← 기록 탭
        help_tab.dart           ← 설명 탭
      widgets/
        court_layout.dart       ← 6존 코트 시각화
        fold_card.dart          ← ExpansionTile 래퍼
        position_chips.dart     ← 포지션 티어 토글
        onboarding_card.dart    ← 빈 상태 안내
```

### 핵심 고려사항

1. **솔버를 Isolate에서 실행**: `solveRound`는 최대 수천 노드 백트래킹 → UI 스레드 블로킹 방지를 위해 `compute()` 사용
2. **상태 관리**: Riverpod 또는 Bloc. `current`(미확정 결과)와 `pastRounds`(확정)를 명확히 분리
3. **저장**: SharedPreferences + JSON 직렬화. 키 체계는 `anchigi.{name}.v1` 유지
4. **랜덤성**: 솔버의 jitter(`Math.random() * 1.6`)를 Dart `Random`으로 치환. 같은 입력에서 다른 결과가 나와야 사용자가 "다시 뽑기"를 할 수 있음
5. **접근성**: 웹 버전의 `aria-selected`, `aria-pressed` 패턴을 Flutter Semantics로 변환

### 웹과의 데이터 호환

- 웹과 앱이 같은 localStorage를 공유하지 않으므로, 데이터 이전이 필요하면 QR/딥링크로 JSON export/import 고려
- 명단 JSON 스키마를 동일하게 유지하면 복사-붙여넣기 호환 가능

---

## 13. 테스트

- **웹**: `tests/anchigi-solver.test.js` — `<script>` 블록을 vm 샌드박스에서 돌린다.
  `npm run test:unit` 에 포함.
- **앱**: `test/anchigi/` 4개 파일 (`flutter test test/anchigi`).

지켜야 할 것:

1. **솔버 정확성**: 모든 자리가 가능 자리 안인지, 한 경기에 한 번만 서는지
2. **ABC 코어 제약**: 코어 선수가 반드시 자기 팀 경기에 출전하는지
3. **공정성 수렴**: 여러 라운드 시뮬레이션에서 출전/대기 편차가 줄어드는지
4. **경계 조건**: 참석 = 2T (C코어 0명), 참석 = 3T (벤치 0명), 퇴장자 포함
5. **예산 완화**: 실험 자리 0으로 불가능할 때 올바르게 완화되는지
6. **빈 자리**: 인원 부족 시 뽑히는지, 채울 수 있는 자리는 다 찼는지,
   빈자리가 두 팀에 고르게 갈리는지
7. **고정**: 고정한 자리/팀을 지키는지, 못 지키면 풀고 알리는지
8. **연속 대기**: 한 라운드에 같은 사람이 두 번 쉬지 않는지
9. **전술 · 포메이션**: 5-1 은 세터 1명 · 6-2 는 2명(하나는 존 4), 한 존에 두 명이
   서지 않는지, 9인제 포메이션의 속공 수와 줄 인원이 정의와 같은지
