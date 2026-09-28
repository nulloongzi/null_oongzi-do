// tests/my-card.test.js — 포장하기(내 카드) 배치 규칙 (js/my-card.js window.myCardLayout).
// 카드는 좌표를 직접 계산해 그리므로 깨지는 방식이 정해져 있다: 블록이 QR 스텁을 덮거나,
// 밥친구 칸이 들어오며 신원이 머리글 위로 밀리거나, 도시락통이 최소치 아래로 눌린다.
// 모두 좌표로 본다(앱 test/my_card_render_test.dart 와 같은 불변식).
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const shareSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'share.js'), 'utf-8');
const cardSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'my-card.js'), 'utf-8');

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
    vm.runInContext(cardSrc, sandbox);
    return window;
}

function data(friends, extra) {
    return Object.assign({
        nickname: '현미밥-a3k', riceType: '현미밥', bgColor: '#FFF9C4', joined: '가입일 2026.7.1',
        mainTeam: '잠실 배구회', slots: ['잠실 배구회', '강동 화요반', null, null, null],
        events: [{ day: 0, start: 19, end: 22, slot: 0, name: '잠실 배구회' }],
        friends: friends || [], url: 'https://do.nulloongzi.com/'
    }, extra || {});
}
const FRIEND = (i) => ({ name: '밥친구' + i, color: '#F8BBD0', tier: (i % 3) + 1, n: i + 1 });

describe('포장하기 배치 — 밥친구 칸', () => {
    for (const feed of [false, true]) {
        const label = feed ? '피드' : '스토리';
        test(label + ': 밥친구 없으면 friends 없음, 있으면 1~4명 칸이 본문 안에', () => {
            const w = load();
            assert.strictEqual(w.myCardLayout(data([]), feed).friends, null);
            for (let n = 1; n <= 6; n++) {
                const L = w.myCardLayout(data(Array.from({ length: n }, (_, i) => FRIEND(i))), feed);
                assert.ok(L.friends, `${n}명`);
                const bodyBot = L.stubTop - w.SHARE_CARD.GAP;
                assert.ok(L.friends.y + L.friends.h <= bodyBot + 0.01, `${label} ${n}명: 스텁을 덮는다`);
                assert.ok(L.bento.y + L.bento.h <= bodyBot + 0.01);
                // 머리글 아래로 (신원이 위로 밀리지 않는다)
                assert.ok(L.identity.y >= L.fmt.top + w.SHARE_CARD.HEADER_H + 24 - 0.01, `${label} ${n}명: 신원이 머리글에 붙는다 y=${L.identity.y}`);
            }
        });
    }
    test('스토리: 밥친구 칸은 도시락통 아래, 도시락통은 최소 320 이상', () => {
        const w = load();
        const L = w.myCardLayout(data([FRIEND(0), FRIEND(1), FRIEND(2), FRIEND(3)]), false);
        assert.ok(L.friends.y >= L.bento.y + L.bento.h + w.SHARE_CARD.GAP - 0.01);
        assert.ok(L.bento.h >= 320);
        assert.strictEqual(L.friends.h, 264);
        assert.ok(L.identity.y + L.identity.h <= L.bento.y - 24 + 0.01);
        // 밥친구 없을 때보다 도시락통이 줄어들 뿐 다른 블록은 그대로
        const L0 = w.myCardLayout(data([]), false);
        assert.ok(L0.bento.h > L.bento.h);
        assert.strictEqual(L0.friends, null);
    });
    test('피드: 얼굴 겹침은 신원 줄 오른쪽 안에, 식단표 크기는 그대로', () => {
        const w = load();
        const L = w.myCardLayout(data([FRIEND(0), FRIEND(1), FRIEND(2)]), true);
        const L0 = w.myCardLayout(data([]), true);
        assert.strictEqual(L.friends.w, 72 + 48 * 2);
        assert.ok(L.friends.x + L.friends.w <= L.identity.x + L.identity.w + 0.01);
        assert.ok(L.friends.y >= L.identity.y - 0.01 && L.friends.y + L.friends.h <= L.identity.y + L.identity.h + 0.01);
        assert.deepStrictEqual(L.diet, L0.diet);
        assert.deepStrictEqual(L.bento, L0.bento);
    });
    test('5명 이상은 4명까지만 자리를 잡는다', () => {
        const w = load();
        const L = w.myCardLayout(data(Array.from({ length: 7 }, (_, i) => FRIEND(i))), true);
        assert.strictEqual(L.friends.w, 72 + 48 * 3);
    });
    test('그리기: Path2D·conic gradient 가 없는 환경에서도 죽지 않는다', async () => {
        const w = load();
        for (const feed of [false, true]) {
            const url = await w.renderMyCard(data([FRIEND(0), FRIEND(1), FRIEND(2), FRIEND(3)]), feed);
            assert.ok(url.startsWith('data:image/png'));
        }
    });
});
