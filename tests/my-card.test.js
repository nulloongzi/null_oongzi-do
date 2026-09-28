// tests/my-card.test.js — 포장하기(내 카드) 배치·데이터 규칙 (js/my-card.js, js/profile.js riceDex).
// 카드는 좌표를 직접 계산해 그리므로 깨지는 방식이 정해져 있다: 블록이 QR 스텁을 덮거나,
// 신원이 머리글 위로 밀리거나, 도시락통이 최소치 아래로 눌린다. 모두 좌표로 본다
// (앱 test/my_card_render_test.dart 와 같은 불변식). 밥도감 번호·단계는 앱 rice_dex.dart 와 같은 표.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf-8');
const shareSrc = read('share.js');
const profileSrc = read('profile.js');
const cardSrc = read('my-card.js');

function makeCtx() {
    const gradient = () => ({ addColorStop() { } });
    return new Proxy({}, {
        get(target, prop) {
            if (prop === 'measureText') return (s) => ({ width: (s ? String(s).length : 0) * 12 });
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createConicGradient') return gradient;
            if (prop === 'canvas') return { ownerDocument: document };
            if (prop in target) return target[prop];
            return function () { };
        },
        set(target, prop, val) { target[prop] = val; return true; }
    });
}
const document = {
    createElement(tag) {
        if (tag === 'canvas') return { width: 0, height: 0, getContext: () => makeCtx(), toDataURL: () => 'data:image/png;base64,AA' };
        return { style: {}, appendChild() { }, setAttribute() { }, classList: { add() { }, remove() { }, toggle() { } } };
    },
    getElementById() { return null; },
    addEventListener() { },
    body: { appendChild() { }, removeChild() { } }
};
function ImageMock() {
    const self = this;
    Object.defineProperty(this, 'src', { set() { if (self.onload) self.onload(); } });
}
function load() {
    const window = {
        t: (k) => k, tf: (k, p) => k + JSON.stringify(p),
        i18nDay: (d) => d, SITE_BASE_URL: 'https://do.nulloongzi.com/'
    };
    const sandbox = { window, document, navigator: {}, Image: ImageMock, console: { log() { }, warn() { }, error() { } } };
    vm.createContext(sandbox);
    vm.runInContext(shareSrc, sandbox);
    vm.runInContext(profileSrc, sandbox);
    vm.runInContext(cardSrc, sandbox);
    return window;
}

function data(w, extra, friendRices) {
    return Object.assign({
        nickname: '현미밥-a3k', riceType: '현미밥', bgColor: '#FFF9C4', joined: '가입일 2026.7.1',
        mainTeam: '잠실 배구회', slots: ['잠실 배구회', '강동 화요반', null, null, null],
        events: [
            { day: 1, start: 20, end: 22, slot: 1, name: '강동 화요반' },
            { day: 3, start: 19, end: 22, slot: 0, name: '잠실 배구회' },
            { day: 5, start: 14, end: 17, slot: 0, name: '잠실 배구회' }
        ],
        dex: w.myCardDex((extra && extra.riceType) || '현미밥', friendRices || []),
        url: 'https://do.nulloongzi.com/'
    }, extra || {});
}

describe('밥도감 표 (profile.js riceDex)', () => {
    test('25종 · 번호는 riceData 순서 · 희귀도는 뽑기 가중치', () => {
        const X = load().riceDex;
        assert.strictEqual(X.total, 25);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(X.info('현미밥'))), { no: 1, name: '현미밥', color: '#FFF9C4', rarity: 'common' });
        assert.strictEqual(X.info('오곡밥').rarity, 'common');
        assert.strictEqual(X.info('차조밥').rarity, 'rare');
        assert.strictEqual(X.info('밥아저씨').no, 25);
        assert.strictEqual(X.info('밥아저씨').rarity, 'legend');
        assert.strictEqual(X.info('누룽지'), null);
        assert.strictEqual(X.riceOf('흑미밥-z9'), '흑미밥');
    });
    test('상차림: 혼밥 1 · 밥상 2–5 · 한상차림 6–12 · 잔칫상 13–24 · 수라상 25', () => {
        const X = load().riceDex;
        const st = (n) => JSON.parse(JSON.stringify(X.stage(n)));
        assert.deepStrictEqual(st(1), { lv: 1, next: 2, need: 1 });
        assert.deepStrictEqual(st(5), { lv: 2, next: 3, need: 1 });
        assert.deepStrictEqual(st(6), { lv: 3, next: 4, need: 7 });
        assert.deepStrictEqual(st(9), { lv: 3, next: 4, need: 4 });
        assert.deepStrictEqual(st(13), { lv: 4, next: 5, need: 12 });
        assert.deepStrictEqual(st(24), { lv: 4, next: 5, need: 1 });
        assert.deepStrictEqual(st(25), { lv: 5, next: 0, need: 0 });
    });
    test('밥친구 전체 + 나, 같은 밥은 한 번, 도감에 없는 이름은 세지 않는다', () => {
        const w = load();
        const X = w.myCardDex('현미밥', ['현미밥', '흑미밥', '흑미밥', '팥밥', '밥아저씨', '']);
        assert.strictEqual(X.count, 3);
        assert.ok(X.owned['현미밥'] && X.owned['흑미밥'] && X.owned['밥아저씨']);
        assert.strictEqual(X.mine.no, 1);
        assert.strictEqual(X.stage.lv, 2);
        // 내 닉네임이 도감 밖이어도 친구 밥은 센다
        const Y = w.myCardDex('누룽지', ['백미밥']);
        assert.strictEqual(Y.mine, null);
        assert.strictEqual(Y.count, 1);
    });
});

describe('포장하기 배치', () => {
    test('네임카드: 신원 · 도시락통 · 밥도감이 머리글과 스텁 사이에 겹치지 않고 들어간다', () => {
        const w = load(), SC = w.SHARE_CARD;
        for (const d of [data(w), data(w, { riceType: '누룽지', mainTeam: null })]) {
            const L = w.myCardLayout(d, 'card');
            const headBot = L.fmt.top + SC.HEADER_H, bodyBot = L.stubTop - SC.GAP;
            assert.strictEqual(L.fmt.h, 1920);
            assert.ok(L.identity.y >= headBot + 16 - 0.01, `신원이 머리글에 붙는다 y=${L.identity.y}`);
            assert.ok(L.identity.y + L.identity.h <= L.bento.y - 16 + 0.01, '신원이 도시락통을 덮는다');
            assert.ok(L.bento.h >= 280, `도시락통 ${L.bento.h}`);
            assert.strictEqual(L.bento.y + L.bento.h + SC.GAP, L.dex.y);
            assert.ok(Math.abs(L.dex.y + L.dex.h - bodyBot) < 0.01, '밥도감이 스텁 위에 붙는다');
            assert.strictEqual(L.diet, null);
        }
    });
    test('네임카드: 도감 밖 닉네임은 번호·한 줄이 빠진 만큼 도시락통이 커진다', () => {
        const w = load();
        const A = w.myCardLayout(data(w), 'card');
        const B = w.myCardLayout(data(w, { riceType: '누룽지' }), 'card');
        assert.ok(B.identity.h < A.identity.h);
        assert.ok(B.bento.h >= A.bento.h);
    });
    test('식단표: 신원 아래 시간표가 스텁 위까지, 도시락통·밥도감 없음', () => {
        const w = load(), SC = w.SHARE_CARD;
        const L = w.myCardLayout(data(w), 'diet');
        assert.strictEqual(L.fmt.h, 1920);
        assert.strictEqual(L.bento, null);
        assert.strictEqual(L.dex, null);
        assert.ok(L.diet.y >= L.identity.y + L.identity.h + 24);
        assert.ok(Math.abs(L.diet.y + L.diet.h - (L.stubTop - SC.GAP)) < 0.01);
        assert.ok(L.diet.h >= 600, `시간표 ${L.diet.h}`);
    });
});

describe('식단표 헤드라인', () => {
    test('요일 + 시간대 성향, 횟수·시간, 범례는 도시락 칸 순서', () => {
        const w = load();
        const S = w.myCardDietSummary(data(w));
        assert.strictEqual(S.head, '화·목·토 mc_kind_eve');
        assert.strictEqual(S.sub, 'mc_diet_sub{"n":3,"h":8}');
        assert.deepStrictEqual(JSON.parse(JSON.stringify(S.legend)), [{ slot: 0, name: '잠실 배구회' }, { slot: 1, name: '강동 화요반' }]);
    });
    test('5일 이상은 "주 N일", 낮이 많으면 낮형, 일정 없으면 기본 제목', () => {
        const w = load();
        const ev = [0, 1, 2, 3, 4].map((day) => ({ day, start: 13, end: 14.5, slot: 0, name: 'A' }));
        const S = w.myCardDietSummary({ events: ev });
        assert.strictEqual(S.head, 'mc_diet_ndays{"n":5} mc_kind_noon');
        assert.strictEqual(S.sub, 'mc_diet_sub{"n":5,"h":7.5}');
        const E = w.myCardDietSummary({ events: [] });
        assert.strictEqual(E.head, 'mc_diet_empty');
        assert.strictEqual(E.sub, '');
    });
});

describe('그리기', () => {
    test('두 장 모두 Path2D·conic gradient 가 없는 환경에서도 죽지 않는다', async () => {
        const w = load();
        const many = Array.from({ length: 24 }, (_, i) => w.riceDex.list()[i].name);
        for (const mode of ['card', 'diet']) {
            for (const d of [data(w), data(w, { events: [], slots: [null, null, null, null, null], mainTeam: null }, many)]) {
                const url = await w.renderMyCard(d, mode);
                assert.ok(url.startsWith('data:image/png'));
            }
        }
    });
});
