// tests/insta-embed.test.js
// 릴스 발견 카드(커버 포스터 → 탭하면 인스타) 렌더러 검증. embed.js 는 더 이상 싣지 않는다.
// 실행: node --test tests/insta-embed.test.js
//
// js/insta-embed.js 는 classic script(IIFE) — window.renderInstaEmbeds/renderReelPoster 정의, dom-utils의
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
        appendChild(c) { c.parentNode = this; this.children.push(c); this.firstChild = this.children[0]; return c; },
        // 포스터/제네릭 카드가 탭 시 자기 자리를 임베드 박스로 바꾸는 경로(card.parentNode.replaceChild)용
        replaceChild(n, o) {
            const i = this.children.indexOf(o);
            if (i >= 0) this.children[i] = n; else this.children.push(n);
            n.parentNode = this; this.firstChild = this.children[0]; return o;
        },
        addEventListener() { }
    };
    Object.defineProperty(el, 'childNodes', { get() { return el.children; } });
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
    const opened = [];
    const window = { t: (k) => (k === 'insta_view' ? 'View on Instagram' : k), open: (u, target, feat) => opened.push([u, target, feat]) };
    if (opts.instgrm) window.instgrm = { Embeds: { process() { processCalls++; } } };

    const sandbox = { window, document, console: { warn() { }, error() { } } };
    vm.createContext(sandbox);
    vm.runInContext(domUtilsSrc, sandbox);
    vm.runInContext(instaEmbedSrc, sandbox);
    return { window, document, appended, opened, getProcessCalls: () => processCalls };
}

const VALID = 'https://www.instagram.com/reel/ABC-123_x/?utm_source=ig_web_copy_link';
const NORM = 'https://www.instagram.com/reel/ABC-123_x/';

describe('renderInstaEmbeds — 커버 → 인스타 (임베드 없음)', () => {
    test('커버 없는 유효 URL → 제네릭 카드, 탭하면 정규화된 permalink 를 새 탭(noopener)으로', () => {
        const { window, document, appended, opened } = load();
        const box = document.createElement('div');
        assert.equal(window.renderInstaEmbeds(box, [VALID]), true);
        assert.equal(box.children.length, 1);
        const card = box.children[0];
        card.onclick();
        assert.deepEqual(opened, [[NORM, '_blank', 'noopener']]);
        assert.equal(appended.length, 0, 'embed.js 스크립트를 주입하지 않는다');
        assert.equal(box.children[0], card, '카드는 그 자리에 남는다(임베드로 교체 안 함)');
    });

    test('커버 있으면 포스터 카드(img src = 커버) + 탭하면 인스타', () => {
        const { window, document, opened } = load();
        const box = document.createElement('div');
        const covers = { 'ABC-123_x': 'https://firebasestorage.googleapis.com/v0/b/x/o/reel_covers%2FABC-123_x.jpg?alt=media' };
        window.renderInstaEmbeds(box, [VALID], covers);
        const card = box.children[0];
        const img = card.children[0];
        assert.equal(img.tagName, 'img');
        assert.equal(img.src, covers['ABC-123_x']);
        assert.equal(img.referrerPolicy, 'no-referrer');
        card.onclick();
        assert.deepEqual(opened, [[NORM, '_blank', 'noopener']]);
    });

    test('커버 로드 실패(onerror) → 같은 자리에 제네릭 카드로 교체, 탭은 여전히 인스타', () => {
        const { window, document, opened } = load();
        const box = document.createElement('div');
        window.renderInstaEmbeds(box, [VALID], { 'ABC-123_x': 'https://cdn/expired.jpg' });
        const poster = box.children[0];
        poster.children[0].onerror();
        const generic = box.children[0];
        assert.notEqual(generic, poster);
        assert.equal(box.children.length, 1);
        generic.onclick();
        assert.deepEqual(opened, [[NORM, '_blank', 'noopener']]);
    });

    test('무효 URL 만 → 컨테이너 비우고 숨김 + false', () => {
        const { window, document } = load();
        const box = document.createElement('div');
        assert.equal(window.renderInstaEmbeds(box, ['https://evil.example/reel/x/', 'javascript:alert(1)']), false);
        assert.equal(box.style.display, 'none');
        assert.equal(box.children.length, 0);
    });

    test('중복·무효 섞인 목록 → 정규화 후 유니크, 2개 이상이면 더 보기 버튼', () => {
        const { window, document } = load();
        const box = document.createElement('div');
        const second = 'https://instagram.com/reels/XYZ_2/?igsh=abc';
        window.renderInstaEmbeds(box, [VALID, NORM, 'nope', second]);
        assert.equal(box.children.length, 3); // 첫 카드 + 더 보기 버튼 + 나머지 래퍼
        const more = box.children[1];
        assert.equal(more.tagName, 'button');
        assert.match(more.textContent, /\(1\)/);
        more.onclick();
        const rest = box.children[2];
        assert.equal(rest.children.length, 1);
        assert.equal(rest.style.display, '');
    });

    test('같은 목록으로 재호출 → 재렌더 생략(깜빡임 방지)', () => {
        const { window, document } = load();
        const box = document.createElement('div');
        window.renderInstaEmbeds(box, [VALID]);
        const first = box.children[0];
        assert.equal(window.renderInstaEmbeds(box, [VALID]), true);
        assert.equal(box.children[0], first);
    });

    test('빈 컨테이너 인자는 안전하게 false', () => {
        const { window } = load();
        assert.equal(window.renderInstaEmbeds(null, [VALID]), false);
    });
});

describe('reelCodeFromUrl', () => {
    test('reel/reels/p/tv 의 shortcode, 그 외 null', () => {
        const { window } = load();
        assert.equal(window.reelCodeFromUrl('https://www.instagram.com/reel/ABC-1_x/?x=1'), 'ABC-1_x');
        assert.equal(window.reelCodeFromUrl('https://instagram.com/p/XYZ/'), 'XYZ');
        assert.equal(window.reelCodeFromUrl('https://www.instagram.com/null_oongzi/'), null);
        assert.equal(window.reelCodeFromUrl(undefined), null);
    });
});

// 릴스 탭 계측(reel_play) — 2026-09-16 결정 로그: 릴스가 물꼬에 도움이 되는지 재기 위한 이벤트.
describe('renderInstaEmbeds → reel_play 계측', () => {
    test('제네릭 카드 탭 → reel_play(source/id/index/poster=generic) 1회', () => {
        const { window, document } = load();
        const calls = [];
        window.track = (name, params) => calls.push([name, params]);
        const box = document.createElement('div');
        assert.equal(window.renderInstaEmbeds(box, [VALID], null, { source: 'club', id: 'c1' }), true);
        assert.equal(calls.length, 0, '렌더만으로는 이벤트 없음');
        box.children[0].onclick();
        assert.deepEqual(calls, [['reel_play', { source: 'club', id: 'c1', index: 0, poster: 'generic' }]]);
    });

    test('커버 포스터 탭 → poster=cover, 두 번째 릴스는 index=1', () => {
        const { window, document } = load();
        const calls = [];
        window.track = (name, params) => calls.push([name, params]);
        const box = document.createElement('div');
        const second = 'https://www.instagram.com/reel/XYZ_2/';
        const covers = { 'ABC-123_x': 'https://cdn.example/cover.jpg' };
        window.renderInstaEmbeds(box, [VALID, second], covers, { source: 'pickup', id: 'p9' });
        box.children[0].onclick(); // 첫 릴스: 커버 포스터
        box.children[1].onclick(); // '릴스 더 보기'
        box.children[2].children[0].onclick(); // 두 번째 릴스: 커버 없음 → 제네릭
        assert.deepEqual(calls, [
            ['reel_play', { source: 'pickup', id: 'p9', index: 0, poster: 'cover' }],
            ['reel_play', { source: 'pickup', id: 'p9', index: 1, poster: 'generic' }]
        ]);
    });

    test('meta 없이 호출해도 안전 — index만 실림', () => {
        const { window, document } = load();
        const calls = [];
        window.track = (name, params) => calls.push([name, params]);
        const box = document.createElement('div');
        window.renderInstaEmbeds(box, [VALID]);
        box.children[0].onclick();
        assert.deepEqual(calls, [['reel_play', { source: undefined, id: undefined, index: 0, poster: 'generic' }]]);
    });

    test('window.track 없으면 탭해도 예외 없음', () => {
        const { window, document } = load();
        const box = document.createElement('div');
        window.renderInstaEmbeds(box, [VALID], null, { source: 'club', id: 'c1' });
        assert.doesNotThrow(() => box.children[0].onclick());
    });
});
