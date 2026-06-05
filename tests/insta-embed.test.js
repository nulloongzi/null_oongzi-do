// tests/insta-embed.test.js
// 인스타 공개 게시물/릴스 임베드(A) 렌더러 검증.
// 실행: node --test tests/insta-embed.test.js
//
// js/insta-embed.js 는 classic script(IIFE) — window.renderInstaEmbed 정의, dom-utils의
// sanitizeInstaPostUrl 에 의존. document/window를 가볍게 mock하고 vm으로 두 스크립트를 적재.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const domUtilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'dom-utils.js'), 'utf-8');
const instaEmbedSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'insta-embed.js'), 'utf-8');

function makeEl(tag) {
    const el = {
        tagName: tag, _attrs: {}, style: {}, dataset: {}, className: '', children: [], firstChild: null,
        _innerHTML: '',
        setAttribute(k, v) { this._attrs[k] = v; },
        getAttribute(k) { return this._attrs[k]; },
        appendChild(c) { this.children.push(c); this.firstChild = this.children[0]; return c; },
        addEventListener() { }
    };
    Object.defineProperty(el, 'innerHTML', {
        get() { return el._innerHTML; },
        set(v) { el._innerHTML = v; if (v === '') { el.children = []; el.firstChild = null; } }
    });
    return el;
}

// 새 샌드박스 + 두 스크립트 적재. opts.instgrm=true면 embed.js 이미 로드된 상태 모사.
function load(opts) {
    opts = opts || {};
    const appended = [];
    const byId = {};
    const document = {
        createElement: (tag) => makeEl(tag),
        getElementById: (id) => byId[id] || null,
        body: { appendChild(node) { appended.push(node); if (node && node.id) byId[node.id] = node; return node; } }
    };
    let processCalls = 0;
    const window = { t: (k) => (k === 'insta_view' ? 'View on Instagram' : k) };
    if (opts.instgrm) window.instgrm = { Embeds: { process() { processCalls++; } } };

    const sandbox = { window, document, console: { warn() { }, error() { } } };
    vm.createContext(sandbox);
    vm.runInContext(domUtilsSrc, sandbox);
    vm.runInContext(instaEmbedSrc, sandbox);
    return { window, document, appended, getProcessCalls: () => processCalls };
}

const VALID = 'https://www.instagram.com/reel/ABC-123_x/?utm_source=ig_web_copy_link';
const NORM = 'https://www.instagram.com/reel/ABC-123_x/';

describe('renderInstaEmbed', () => {
    test('유효 URL → blockquote 생성 + permalink 정규화 + true', () => {
        const { window } = load({ instgrm: true });
        const box = makeEl('div');
        const ok = window.renderInstaEmbed(box, VALID);

        assert.strictEqual(ok, true);
        assert.strictEqual(box.style.display, 'block');
        assert.ok(box.firstChild, 'blockquote가 들어가야 함');
        assert.strictEqual(box.firstChild.className, 'instagram-media');
        assert.strictEqual(box.firstChild.getAttribute('data-instgrm-permalink'), NORM);
        assert.strictEqual(box.dataset.reelUrl, NORM);
    });

    test('embed.js 이미 로드면 Embeds.process() 호출', () => {
        const { window, getProcessCalls } = load({ instgrm: true });
        window.renderInstaEmbed(makeEl('div'), VALID);
        assert.strictEqual(getProcessCalls(), 1);
    });

    test('embed.js 미로드면 스크립트를 1회 주입', () => {
        const { window, appended } = load({ instgrm: false });
        window.renderInstaEmbed(makeEl('div'), VALID);
        const scripts = appended.filter((n) => n.id === 'insta-embed-js');
        assert.strictEqual(scripts.length, 1);
        assert.strictEqual(scripts[0].src, 'https://www.instagram.com/embed.js');
    });

    test('무효 URL → 컨테이너 비우고 숨김 + false', () => {
        const { window } = load({ instgrm: true });
        const box = makeEl('div');
        const ok = window.renderInstaEmbed(box, 'https://evil.com/reel/x/');
        assert.strictEqual(ok, false);
        assert.strictEqual(box.style.display, 'none');
        assert.strictEqual(box.firstChild, null);
    });

    test('같은 URL 재호출 → 재처리 생략(중복 삽입 없음)하고 true', () => {
        const { window } = load({ instgrm: true });
        const box = makeEl('div');
        window.renderInstaEmbed(box, VALID);
        const ok2 = window.renderInstaEmbed(box, VALID);
        assert.strictEqual(ok2, true);
        assert.strictEqual(box.children.length, 1, 'blockquote가 중복으로 쌓이면 안 됨');
    });

    test('빈 컨테이너 인자는 안전하게 false', () => {
        const { window } = load();
        assert.strictEqual(window.renderInstaEmbed(null, VALID), false);
    });
});
