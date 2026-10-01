// tests/back-nav.test.js — 폰 뒤로가기로 창 닫기(js/back-nav.js).
// 가짜 history(칸 배열 + 비동기 popstate)로 브라우저 흐름을 흉내 낸다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'back-nav.js'), 'utf-8');
const tick = () => new Promise((r) => setTimeout(r, 5));

function makeEnv() {
    const entries = [{ state: null, url: '/' }];
    let idx = 0;
    const listeners = [];
    const fire = () => listeners.forEach((f) => f({ state: entries[idx].state }));
    const history = {
        get state() { return entries[idx].state; },
        pushState(s, _t, u) { entries.splice(idx + 1); entries.push({ state: s, url: u }); idx++; },
        replaceState(s, _t, u) { entries[idx] = { state: s, url: u || entries[idx].url }; },
        back() { if (idx > 0) { idx--; setTimeout(fire, 0); } },
    };
    const location = { get href() { return entries[idx].url; }, get pathname() { return '/'; } };
    const window = { history, location, addEventListener(t, f) { if (t === 'popstate') listeners.push(f); } };
    vm.runInNewContext(SRC, { window, history, location, setTimeout, clearTimeout, console });
    return {
        nav: window.backNav,
        history,
        get depth() { return idx; },
        get url() { return entries[idx].url; },
        pressBack() { history.back(); return tick(); },
    };
}

function overlay(env, key, opts) {
    const o = { open: false, closes: 0 };
    o.show = () => { o.open = true; env.nav.open(key, o.hide, opts); };
    o.hide = () => { o.open = false; o.closes++; };
    o.closeByTouch = () => { o.hide(); env.nav.closed(key); };
    return o;
}

describe('backNav', () => {
    test('창을 열면 칸이 하나 생기고, 뒤로가기가 그 창을 닫는다', async () => {
        const env = makeEnv();
        const sheet = overlay(env, 'club', { url: '?club=a', baseUrl: '/' });
        sheet.show();
        assert.strictEqual(env.depth, 1);
        assert.strictEqual(env.url, '?club=a');
        await env.pressBack();
        assert.strictEqual(sheet.open, false);
        assert.strictEqual(env.depth, 0);
        assert.strictEqual(env.url, '/');
    });

    test('겹쳐 연 창은 위에서부터 하나씩 닫힌다 (공유 → 상세)', async () => {
        const env = makeEnv();
        const sheet = overlay(env, 'club');
        const share = overlay(env, 'share');
        sheet.show(); share.show();
        await env.pressBack();
        assert.strictEqual(share.open, false);
        assert.strictEqual(sheet.open, true, '상세는 그대로');
        await env.pressBack();
        assert.strictEqual(sheet.open, false);
    });

    test('쓸어내려 닫으면 넣어 둔 칸을 조용히 뺀다 — 다음 뒤로가기가 헛돌지 않게', async () => {
        const env = makeEnv();
        const sheet = overlay(env, 'club');
        sheet.show();
        sheet.closeByTouch();
        await tick();
        assert.strictEqual(env.depth, 0);
        assert.strictEqual(sheet.closes, 1, '되감기가 닫기를 한 번 더 부르지 않는다');
    });

    test('닫자마자 다른 창을 열면 칸을 이어받는다 (도시락 → 상세)', async () => {
        const env = makeEnv();
        const lunchbox = overlay(env, 'lunchbox');
        const sheet = overlay(env, 'club', { url: '?club=b' });
        lunchbox.show();
        lunchbox.closeByTouch();
        sheet.show();
        await tick();
        assert.strictEqual(env.depth, 1, '칸은 하나 — 되감지도, 더 넣지도 않았다');
        assert.strictEqual(sheet.open, true);
        await env.pressBack();
        assert.strictEqual(sheet.open, false);
        assert.strictEqual(env.depth, 0);
    });

    test('열린 창을 다시 열면(다른 팀으로 바꾸기) 칸을 더 넣지 않고 주소만 바꾼다', () => {
        const env = makeEnv();
        env.nav.open('club', () => { }, { url: '?club=a' });
        env.nav.open('club', () => { }, { url: '?club=b' });
        assert.strictEqual(env.depth, 1);
        assert.strictEqual(env.url, '?club=b');
    });

    test('다른 코드가 state 를 살려 주소를 바꾸면 순서가 유지된다', async () => {
        const env = makeEnv();
        const sheet = overlay(env, 'club');
        const share = overlay(env, 'share');
        sheet.show();
        env.history.replaceState(env.history.state, '', '?club=c'); // 예: 필터·딥링크 동기화
        share.show();
        await env.pressBack();
        assert.strictEqual(share.open, false);
        assert.strictEqual(sheet.open, true);
    });

    test('창이 없을 때 뒤로가기는 아무것도 닫지 않는다(브라우저 기본 동작)', async () => {
        const env = makeEnv();
        const sheet = overlay(env, 'club');
        await env.pressBack();
        assert.strictEqual(sheet.closes, 0);
    });
});
