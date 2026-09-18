// tests/anchigi-solver.test.js
// 안치기(anchigi.html) 배치 솔버 검증.
// 실행: node --test tests/anchigi-solver.test.js
//
// anchigi.html 은 단일 파일(인라인 classic script)이라, <script> 블록만 떼어
// vm 샌드박스에서 돌린다. DOM·localStorage 는 렌더가 터지지 않을 만큼만 흉내 낸다.
// 검증 대상은 렌더가 아니라 솔버(solveRound)와 명단 모델이다.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'anchigi.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const source = html.split('<script>')[1].split('</script>')[0];

function stubEl() {
    const el = {
        innerHTML: '', textContent: '', value: '', files: null,
        style: {}, classList: { toggle() { }, add() { }, remove() { } },
        onclick: null, onchange: null, onkeydown: null,
        addEventListener() { }, removeEventListener() { },
        setAttribute() { }, getAttribute() { return null; }, hasAttribute() { return false; },
        appendChild() { }, removeChild() { }, remove() { }, insertAdjacentHTML() { },
        scrollIntoView() { }, click() { }, focus() { },
        querySelector() { return stubEl(); }, querySelectorAll() { return []; },
        closest() { return null; },
    };
    return el;
}

/** seed 로 localStorage 를 미리 채운 뒤 스크립트를 돌린다(저장본 마이그레이션 검증용). */
function makeSandbox(seed) {
    const store = new Map(Object.entries(seed || {}));
    const sandbox = {
        console,
        URLSearchParams,
        setTimeout, clearTimeout,
        Math, Date, JSON,
        alert() { }, confirm() { return true; },
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        },
        location: { search: '', origin: 'https://nulloongzi.do', href: '' },
        history: { length: 1, back() { } },
        document: {
            referrer: '',
            documentElement: stubEl(),
            body: stubEl(),
            getElementById: () => stubEl(),
            querySelector: () => stubEl(),
            querySelectorAll: () => [],
            createElement: () => stubEl(),
            addEventListener() { },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return sandbox;
}

/** 명단을 갈아 끼우고(참석 전원) 라운드를 뽑는다. */
function draw(box, people, { sport = 'v6', mode = 'free', prio = 'custom', nGames = 3, tactic = '5-1' } = {}) {
    box.sport = sport;
    box.POS = box.POS_BY_SPORT[sport];
    box.mode = mode;
    box.prio = prio;
    box.nGames = nGames;
    box.flexSlots = null;
    box.tactic = tactic;
    box.allowed = box.TEMPLATES.map((t) => t.id);
    box.stat = {};
    box.round = 1;
    box.players = people.map((p) => box.normalizePlayer(p));
    return box.solveRound(box.players.filter((p) => p.here), nGames);
}

/** 이름 n명을 만든다. tiers 는 {포지션: 티어} 맵이나 null(=어디든). */
function roster(n, tierOf) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ name: 'P' + (i + 1), tier: tierOf ? tierOf(i) : {}, here: true, leave: null });
    }
    return out;
}

/** 6-2 전술은 세터 두 명이 코트에 선다. */
const V6_TWO_SETTERS = (i) => {
    const cycle = [
        { S: 'main' }, { S: 'main' },
        { OH: 'main' }, { OH: 'main' },
        { MB: 'main' }, { MB: 'main', Li: 'sub' },
    ];
    return Object.assign({}, cycle[i % cycle.length]);
};

const V6_MAIN = (i) => {
    const cycle = [
        { S: 'main', OH: 'sub' },
        { OH: 'main', MB: 'sub' },
        { MB: 'main', OH: 'sub' },
        { OP: 'main', OH: 'sub' },
        { OH: 'main', Li: 'sub' },
        { Li: 'main', OH: 'sub' },
    ];
    return Object.assign({}, cycle[i % cycle.length]);
};

let box;
beforeEach(() => { box = makeSandbox(); });

describe('명단 모델', () => {
    test('자리를 하나도 안 고르면 어디든 설 수 있는 사람이 된다', () => {
        const p = box.normalizePlayer({ name: '누룽', tier: {}, here: true });
        assert.strictEqual(box.isFlex(p), true);
        assert.deepStrictEqual(p.pos, box.POS_BY_SPORT.v6);
        assert.strictEqual(box.tierOf(p, 'Li'), 'main');
    });

    test('예전 저장본(pos 배열)은 전부 주 자리로 올라온다', () => {
        const p = box.normalizePlayer({ name: '옛날', pos: ['S', 'OH'], here: true });
        // 샌드박스 안에서 만들어진 배열이라 Array.from 으로 이쪽 realm 배열로 옮겨 비교한다
        assert.deepStrictEqual(Array.from(p.pos), ['S', 'OH']);
        assert.strictEqual(p.tier.S, 'main');
        assert.strictEqual(box.isFlex(p), false);
    });

    test('종목을 바꾸면 가능 자리가 그 종목 자리로 갈린다', () => {
        box.players = [box.normalizePlayer({ name: 'A', tier: { S: 'main' }, here: true })];
        box.sport = 'v9';
        box.refreshSport();
        assert.deepStrictEqual(box.players[0].pos, box.POS_BY_SPORT.v9); // 9인제 자리는 미지정 → 어디든
    });
});

/** 배치가 규칙을 지키는지 — 자리는 가능 자리 안, 한 경기에 한 번만. */
function assertLineupSane(box, games, { sport = 'v6' } = {}) {
    const byId = {};
    box.players.forEach((p) => { byId[p.id] = p; });
    games.forEach((g) => {
        const seen = new Set();
        g.teams.forEach((t) => {
            t.forEach((x) => {
                if (x.empty) {
                    assert.ok(box.POS_BY_SPORT[sport].includes(x.p), '빈 자리도 그 종목 자리여야 한다');
                    return;
                }
                assert.ok(!seen.has(x.id), '한 사람이 한 경기에 두 번 설 수 없다');
                seen.add(x.id);
                assert.ok(byId[x.id].pos.includes(x.p), x.n + ' 은 ' + x.p + ' 를 볼 수 있어야 한다');
            });
        });
        g.bench.forEach((b) => {
            assert.ok(!seen.has(b.id), '뛰는 사람이 동시에 대기일 수 없다');
        });
    });
}

describe('6인제 배치', () => {
    test('12명이면 자리가 다 차고 대기가 없다', () => {
        const games = draw(box, roster(12, V6_MAIN));
        assert.ok(games, '배치가 나와야 한다');
        assert.strictEqual(games.length, 3);
        games.forEach((g) => {
            assert.strictEqual(g.teams[0].length + g.teams[1].length, 12);
            assert.strictEqual(g.teams[0].concat(g.teams[1]).filter((x) => x.empty).length, 0);
            assert.strictEqual(g.bench.length, 0);
        });
        assertLineupSane(box, games);
    });

    test('A · B · C 고정 모드도 같은 규칙을 지킨다', () => {
        const games = draw(box, roster(14, V6_MAIN), { mode: 'abc' });
        assert.ok(games);
        games.forEach((g) => {
            assert.ok(g.cores, 'ABC 모드는 코어를 남긴다');
            assert.strictEqual(g.teams[0].concat(g.teams[1]).filter((x) => x.empty).length, 0);
        });
        assertLineupSane(box, games);
    });

    test('연속 대기를 피한다 — 13명 3경기에서 같은 사람이 두 번 쉬지 않는다', () => {
        const games = draw(box, roster(13, V6_MAIN));
        assert.ok(games);
        const benched = [];
        games.forEach((g) => g.bench.forEach((b) => benched.push(b.id)));
        // 13명·3경기면 구성에 따라(6+7=13) 대기가 없는 경기도 있다.
        // 중요한 건 같은 사람이 한 라운드에 두 번 쉬지 않는 것.
        assert.strictEqual(new Set(benched).size, benched.length,
            '한 사람이 한 라운드에 두 번 쉬면 안 된다');
    });
});

describe('6인제 전술', () => {
    test('5-1 은 코트에 세터가 한 명', () => {
        const games = draw(box, roster(12, V6_MAIN));
        assert.ok(games);
        games.forEach((g) => g.teams.forEach((t) => {
            assert.strictEqual(t.filter((x) => x.p === 'S').length, 1);
        }));
    });

    test('6-2 는 코트에 세터가 두 명 — 하나는 라이트 자리', () => {
        const games = draw(box, roster(12, V6_TWO_SETTERS), { tactic: '6-2' });
        assert.ok(games, '6-2 로도 배치가 나와야 한다');
        games.forEach((g) => g.teams.forEach((t) => {
            const setters = t.filter((x) => x.p === 'S');
            assert.strictEqual(setters.length, 2);
            // 전위 세터는 라이트(존 4) 자리에 선다
            assert.deepStrictEqual(Array.from(setters.map((x) => x.z).sort()), [1, 4]);
        }));
        assertLineupSane(box, games);
    });

    test('존이 겹치지 않는다', () => {
        const games = draw(box, roster(12, V6_MAIN));
        games.forEach((g) => g.teams.forEach((t) => {
            const zones = t.filter((x) => !x.off).map((x) => x.z).sort();
            assert.strictEqual(new Set(zones).size, zones.length, '한 존에 두 명이 설 수 없다');
        }));
    });
});

describe('인원이 모자랄 때 — 빈 자리를 (필요)로 남긴다', () => {
    test('9명이면 뽑히긴 하고 빈 자리가 표시된다', () => {
        const games = draw(box, roster(9, V6_MAIN));
        assert.ok(games, '인원이 모자라도 배치는 나와야 한다');
        games.forEach((g) => {
            const all = g.teams[0].concat(g.teams[1]);
            const empties = all.filter((x) => x.empty);
            assert.ok(empties.length > 0, '빈 자리가 있어야 한다');
            assert.strictEqual(all.length - empties.length, 9, '온 사람은 전원 코트에 선다');
            assert.deepStrictEqual(
                g.need[0].concat(g.need[1]).slice().sort(),
                empties.map((x) => x.p).sort(),
                'need 목록과 빈 칸이 일치해야 한다',
            );
        });
        assertLineupSane(box, games);
    });

    test('아무도 못 서는 자리는 비운다 — 리베로 가능자가 없어도 뽑힌다', () => {
        // 전원 세터/레프트만 가능 → Li 자리는 채울 사람이 없다
        const people = roster(12, () => ({ S: 'sub', OH: 'sub' }));
        const games = draw(box, people);
        box.allowed = ['mb1li'];   // 리베로가 반드시 필요한 구성만 남긴다
        const g2 = box.solveRound(box.players, 3);
        assert.ok(g2, '리베로 가능자가 없어도 배치는 나와야 한다');
        assert.ok(
            g2.some((g) => g.need[0].concat(g.need[1]).indexOf('Li') >= 0),
            '리베로 자리가 (필요)로 남아야 한다',
        );
        assert.ok(games);
        assertLineupSane(box, games);
    });

    test('A · B · C 인원이 안 되면 자유 편성으로 내려간다', () => {
        const games = draw(box, roster(9, V6_MAIN), { mode: 'abc' });
        assert.ok(games);
        assert.strictEqual(box.abcFellBack, true);
    });
});

describe('검수에서 나온 것들', () => {
    test('자리를 볼 사람이 자리 수보다 적어도 뽑히고 (필요)로 남는다', () => {
        // 18명 중 세터를 볼 사람은 한 명인데 코트에는 세터 자리가 둘(팀당 하나)
        const people = roster(18, (i) => (i === 0
            ? { S9: 'main' }
            : { QK: 'main', L9: 'sub', R9: 'sub', CH: 'sub', BK: 'sub' }));
        box.tactic = '5-1';
        box.sport = 'v9';
        box.POS = box.POS_BY_SPORT.v9;
        box.mode = 'free';
        box.prio = 'custom';
        box.nGames = 3;
        box.flexSlots = null;
        box.allowed = ['v9q1'];
        box.stat = {};
        box.round = 1;
        box.players = people.map((p) => box.normalizePlayer(p));

        assert.strictEqual(box.shortHanded(box.players), true, '미리 알려줘야 한다');
        const games = box.solveRound(box.players, 3);
        assert.ok(games, '막지 말고 뽑아야 한다');
        games.forEach((g) => {
            assert.ok(
                g.need[0].concat(g.need[1]).indexOf('S9') >= 0,
                '세터 자리가 (필요)로 남아야 한다',
            );
        });
    });

    test('빈 자리가 있는 라운드를 확정해도 지난 기록이 날아가지 않는다', () => {
        const games = draw(box, roster(9, V6_MAIN), { nGames: 1 });
        assert.ok(games);
        // dropLegacyPast 가 쓰는 판정과 같은 식
        const legacy = games.some((g) => g.teams.some((t) =>
            t.some((x) => !x || (!x.empty && x.id == null))));
        assert.strictEqual(legacy, false, '빈 자리는 구형 기록이 아니다');
    });

    test('고정 때문에 A · B · C 가 막히면 고정을 풀지, 자유 편성으로 내려가지 않는다', () => {
        // 12명 · 6인 팀이면 C 코어가 0명이라 C 로 지정한 사람은 들어갈 자리가 없다
        const people = roster(12, V6_MAIN);
        people[0].pinTeam = 2;
        const games = draw(box, people, { mode: 'abc' });
        assert.ok(games, '배치는 나와야 한다');
        assert.strictEqual(box.pinsRelaxed, true, '고정을 풀었다고 알려야 한다');
        assert.strictEqual(box.abcFellBack, false, 'A · B · C 를 포기할 일이 아니다');
        assert.ok(games[0].cores, 'A · B · C 로 짜여야 한다');
    });

    test('껐던 구성은 다시 켜지지 않는다', () => {
        // 새 구성을 아는 저장본(6-2 를 꺼 둔 상태)은 그대로 읽어야 한다
        const kept = ['mb2', 'mb1li', 'mb2li', 'v9q1', 'v9q2', 'v9q3'];
        const box2 = makeSandbox({ 'anchigi.tpl.v1': JSON.stringify(kept) });
        assert.ok(box2.allowed.indexOf('mb2x62') < 0, '꺼 둔 6-2 구성이 되살아나면 안 된다');
    });

    test('5-1 구성만 있던 예전 저장본에는 새 구성을 켜 준다', () => {
        const box2 = makeSandbox({ 'anchigi.tpl.v1': JSON.stringify(['mb2', 'mb1li', 'mb2li']) });
        assert.ok(box2.allowed.indexOf('mb2x62') >= 0, '6-2 를 몰랐던 저장본이다');
        assert.ok(box2.allowed.indexOf('v9q2') >= 0);
    });

    test('확정할 때 빈 자리를 사람으로 세지 않는다', () => {
        const games = draw(box, roster(9, V6_MAIN), { nGames: 1 });
        box.current = { round: 1, games: games, sport: 'v6', mode: 'free', prio: 'custom', budget: 1, flexAsked: 1 };
        box.commit();
        assert.ok(!('undefined' in box.stat), "stat 에 'undefined' 가 생기면 안 된다");
        assert.strictEqual(Object.keys(box.stat).length, 9);
    });
});

describe('9인제', () => {
    test('18명이면 포메이션 아홉 자리를 채운다', () => {
        const games = draw(box, roster(18, null), { sport: 'v9' });
        assert.ok(games);
        games.forEach((g) => {
            assert.strictEqual(g.teams[0].length, 9);
            assert.strictEqual(g.teams[1].length, 9);
            g.teams.forEach((t, ti) => {
                const tpl = box.tplById(g.tpls[ti]);
                assert.ok(tpl, '어떤 포메이션으로 짰는지 남아야 한다');
                // 자리 구성이 포메이션 정의와 같아야 한다(속공 수 · 줄 인원)
                assert.deepStrictEqual(
                    t.map((x) => x.p),
                    tpl.slots.map((sl) => sl.p),
                );
                assert.strictEqual(
                    tpl.rows.reduce((a, b) => a + b, 0), 9,
                    '줄 인원의 합이 아홉이어야 한다',
                );
            });
        });
        assertLineupSane(box, games, { sport: 'v9' });
    });

    test('포메이션마다 속공 수가 1 · 2 · 3 으로 갈린다', () => {
        const counts = box.TEMPLATES
            .filter((t) => t.sport === 'v9')
            .map((t) => t.slots.filter((sl) => sl.p === 'QK').length);
        assert.deepStrictEqual(Array.from(counts), [1, 2, 3]);
    });

    test('12명이면 여섯 자리를 (필요)로 남긴다', () => {
        const games = draw(box, roster(12, null), { sport: 'v9' });
        assert.ok(games);
        games.forEach((g) => {
            const all = g.teams[0].concat(g.teams[1]);
            assert.strictEqual(all.filter((x) => x.empty).length, 6);
        });
    });
});

describe('고정(핀)', () => {
    test('자리를 고정하면 그 자리에만 선다', () => {
        const people = roster(12, V6_MAIN);
        people[0].tier = { S: 'main', OH: 'sub' };
        people[0].pin = { v6: 'S' };
        const games = draw(box, people);
        assert.ok(games);
        const pinnedId = box.players[0].id;
        let seen = 0;
        games.forEach((g) => g.teams.forEach((t) => t.forEach((x) => {
            if (x.id === pinnedId) { seen++; assert.strictEqual(x.p, 'S'); }
        })));
        assert.ok(seen > 0, '고정한 사람은 실제로 뛰어야 한다');
    });

    test('팀을 고정하면 그 코어로 간다 (A · B · C 모드)', () => {
        const people = roster(14, V6_MAIN);
        people[0].pinTeam = 2;   // C 코어
        const games = draw(box, people, { mode: 'abc' });
        assert.ok(games);
        const pinnedId = box.players[0].id;
        assert.ok(games[0].cores[2].some((x) => x.id === pinnedId), 'C 코어에 있어야 한다');
    });

    test('고정을 다 지킬 수 없으면 풀고 뽑되 그 사실을 남긴다', () => {
        // 열두 명 전원을 세터 자리에 고정 → 지킬 수 없다
        const people = roster(12, () => ({ S: 'main', OH: 'sub' }));
        people.forEach((p) => { p.pin = { v6: 'S' }; });
        const games = draw(box, people);
        assert.ok(games, '고정을 풀어서라도 배치는 나와야 한다');
        assert.strictEqual(box.pinsRelaxed, true);
    });
});

describe('공정성', () => {
    test('여러 라운드를 돌려도 출전 편차가 벌어지지 않는다', () => {
        const people = roster(15, V6_MAIN);
        box.sport = 'v6';
        box.POS = box.POS_BY_SPORT.v6;
        box.mode = 'free';
        box.prio = 'custom';
        box.nGames = 3;
        box.flexSlots = null;
        box.allowed = ['mb2', 'mb1li', 'mb2li'];
        box.stat = {};
        box.round = 1;
        box.players = people.map((p) => box.normalizePlayer(p));

        for (let r = 0; r < 4; r++) {
            const games = box.solveRound(box.players, 3);
            assert.ok(games, r + 1 + '라운드가 나와야 한다');
            games.forEach((g) => {
                g.teams.forEach((t) => t.forEach((x) => {
                    if (x.empty) return;
                    const s = box.st(x.id);
                    s.play++; s.pos[x.p]++;
                }));
                g.bench.forEach((b) => { box.st(b.id).bench++; });
            });
            box.round++;
        }
        const plays = box.players.map((p) => box.st(p.id).play);
        const gap = Math.max(...plays) - Math.min(...plays);
        assert.ok(gap <= 3, '출전 편차가 3경기를 넘지 않아야 한다 (실제 ' + gap + ')');
    });
});
