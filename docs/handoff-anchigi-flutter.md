# Handoff: 안치기 Flutter 네이티브 구현

> **원본**: `anchigi.html` (단일 파일, Vanilla JS, 2300줄)
> **목표**: Flutter 앱(`null_oongzi-do-app`)에 네이티브 화면으로 이식
> **작성일**: 2026-08-24

---

## 1. 기능 요약

안치기는 배구 동호회 현장에서 **참석자 명단 + 가능 포지션**만 넣으면 라운드별 팀 배치를 즉석에서 뽑아주는 도구다.

- 명단 관리 (이름, 포지션 티어, 참석/퇴장 시간)
- 라운드 배치 뽑기 (CSP 백트래킹 + 공정성 점수)
- ABC 고정 모드 / 자유 편성 모드
- 게임 성격 4단계 (경쟁 → 경험)
- 누적 기록으로 출전/대기/포지션 분배 균등화
- KO/EN 2개 언어

---

## 2. 데이터 모델

### Player

```dart
class Player {
  final String id;       // "p" + base36Counter + "-" + randomBase36
  String name;
  Map<String, String> tier;  // { "S": "main", "OH": "sub", ... }
  bool here;             // 참석 여부
  String? leave;         // 퇴장 시간 "HH:MM" or null

  // 파생 필드
  List<String> get pos => tier.keys.toList();  // 가능 포지션 목록
}
```

**티어 값**: `main`(주), `sub`(가능), `want`(도전). 키가 없으면 불가.

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
| `feel` | `String` | `"real"` | `comp/real/mix/exp` |
| `allowed` | `List<String>` | `["mb2","mb1li","mb2li"]` | 허용된 팀 구성 |
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

| id | 인원 | 슬롯 | 설명 |
|----|------|------|------|
| `mb2` | 6 | S, OP, OH, OH, MB, MB | 리베로 없음 |
| `mb1li` | 6 | S, OP, OH, OH, MB, Li | 센터 1 + 리베로 1 |
| `mb2li` | 7 | S, OP, OH, OH, MB, MB, Li | 리베로가 후위 센터와 교대 |

대각 규칙: S↔OP, OH↔OH, MB↔Li(or MB).

---

## 4. 게임 성격 (Feel)

| 키 | budget | fitW | varietyW | newBonus | playW | balanceW |
|----|--------|------|----------|----------|-------|----------|
| `comp` | 0 | 3.0 | 0.8 | 0.0 | 1.5 | 8.0 |
| `real` | 1 | 2.0 | 1.2 | 1.5 | 1.5 | 5.0 |
| `mix` | 2 | 0.8 | 2.5 | 4.0 | 1.0 | 2.5 |
| `exp` | 99 | 0.0 | 4.0 | 6.0 | 0.6 | 1.0 |

- `budget`: 팀당 최대 비주 포지션 수 (하드 제약)
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
     + (2 - fitOf(tier)) * fitW        // 비주 포지션이면 비용↑
     - (5 - nOptions) * 1.0            // 포지션 적은 사람 우선
     - 5.0 (if leaving early)          // 일찍 가는 사람 우선
     + posCount * varietyW             // 같은 포지션 반복 패널티
     - newBonus (if new position)      // 새 포지션 보너스
     + setter overuse penalty          // 세터 전용인데 과다 출전
```

**benchCost**: 대기 비용 = `(avgPlay - play) * 3.5 + bench * 4.0 + (early ? 10.0 : 0)`

**팀 간 균형**: `|fitAvg_team0 - fitAvg_team1| * balanceW * 6`

### 5.4 예산 완화

feel의 budget으로 시작, 실패하면 +1씩 올려 최대 7까지. 완화됐으면 UI에 알림.

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

### 웹 (현재): localStorage

키 패턴: `anchigi.{name}.v1` (이전 `gvt.{name}.v1`에서 마이그레이션 포함)

### Flutter 권장

- **SharedPreferences** 또는 **Hive**: 단순 KV 저장
- **구조**: 같은 키 체계 유지하되 JSON 직렬화
- 마이그레이션 로직은 Flutter 최초 버전이므로 불필요

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
const POS = ['S', 'OP', 'OH', 'MB', 'Li'];
const POS_KO = { 'S': '세터', 'OP': '라이트', 'OH': '레프트', 'MB': '센터', 'Li': '리베로' };
const TIERS = ['main', 'sub', 'want'];
const FIT = { 'main': 2, 'sub': 1, 'want': 0 };
const FEELS = ['comp', 'real', 'mix', 'exp'];
const PAIRS = [[0,1,2], [1,2,0], [2,0,1]];  // ABC 경기 순서
const TEAM_NAME = ['A', 'B', 'C'];
const EARLY_SLOT_BONUS = 5.0;
const EARLY_BENCH_PENALTY = 10.0;
const SETTER_OVERUSE_N = 1;
```

---

## 12. Flutter 구현 권장사항

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

## 13. 테스트 우선순위

1. **솔버 정확성**: 모든 슬롯이 가능 포지션 안인지, 대각 규칙 충족하는지
2. **ABC 코어 제약**: 코어 선수가 반드시 자기 팀 경기에 출전하는지
3. **공정성 수렴**: 10라운드 시뮬레이션에서 출전/대기 편차가 줄어드는지
4. **경계 조건**: 참석 = 2T (C코어 0명), 참석 = 3T (벤치 0명), 퇴장자 포함
5. **예산 완화**: comp(0) 모드에서 주 포지션만으로 불가능할 때 올바르게 완화되는지
