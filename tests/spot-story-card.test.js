// tests/spot-story-card.test.js
// 인스타 스토리 카드(9:16) + 네이티브 브리지 검증.
// 실행: node --test tests/spot-story-card.test.js
//
// js/share.js 는 classic script(IIFE 아님) — window.* 와 일부 전역에 함수를 정의한다.
// 브라우저 헤드리스는 이 샌드박스에서 불가하므로 canvas/Image/document를 가볍게 mock하고
// vm으로 share.js를 실행해 generateSpotStoryCard / shareSpotToStory 를 검증한다.
// (qrcode-generator는 런타임 CDN 전역 window.qrcode — 여기선 mock 또는 부재로 폴백 검증.)

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const shareSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'share.js'), 'utf-8');

// ── 가벼운 mock들 ──────────────────────────────────────────────────────────
// 2D 컨텍스트: 모든 메서드는 no-op, measureText/createLinearGradient만 특수 처리.
function makeCtx() {
    return new Proxy({}, {
        get(target, prop) {
            if (prop === 'measureText') return (s) => ({ width: (s ? String(s).length : 0) * 12 });
            if (prop === 'createLinearGradient') return () => ({ addColorStop() { } });
            if (prop in target) return target[prop];
            return function () { };
        },
        set(target, prop, val) { target[prop] = val; return true; }
    });
}

function makeEl() {
    const store = { style: {}, value: '', innerHTML: '' };
    return new Proxy(store, {
        get(t, p) { if (p in t) return t[p]; return function () { }; },
        set(t, p, v) { t[p] = v; return true; }
    });
}

// 새 샌드박스를 만들어 share.js를 적재. opts로 동작 분기.
function loadShare(opts) {
    opts = opts || {};
    const dict = {
        brand: '누룽지도', sh_club_fallback: '배구 동호회', pk_beginner_ok: '🌱 초보환영',
        pk_english_ok: '🌐 English OK', pk_thisweek_badge: '이번주',
        sh_card_cta: 'QR 찍으면 누룽지도에서 열려요'
    };

    const els = { previewImgBox: makeEl(), previewOverlay: makeEl(), profileOverlay: makeEl() };

    const document = {
        createElement(tag) {
            if (tag === 'canvas') {
                return {
                    width: 0, height: 0,
                    getContext: () => makeCtx(),
                    toDataURL() {
                        if (opts.throwToDataURL) throw new Error('toDataURL boom');
                        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
                    }
                };
            }
            return makeEl();
        },
        getElementById(id) { return Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null; },
        body: { appendChild() { }, removeChild() { } }
        // fonts 의도적으로 없음 → fontsReady = Promise.resolve()
    };

    function ImageMock() {
        const self = this;
        this.onload = null; this.onerror = null;
        Object.defineProperty(this, 'src', {
            configurable: true,
            set(v) { this._src = v; if (self.onload) self.onload(); }  // 즉시 onload
        });
    }

    const tracks = [];
    const window = {
        t: (k, fb) => (dict[k] != null ? dict[k] : (fb != null ? fb : k)),
        pkSportLabel: () => '6s',
        pkLevelLabel: () => 'All levels',
        track: (name, params) => tracks.push({ name, params })
    };
    if (opts.withQR) {
        window.qrcode = (type, ecl) => ({
            addData() { }, make() { },
            getModuleCount: () => 25,
            isDark: (r, c) => (r + c) % 2 === 0
        });
    }
    if (opts.nativeShare) {
        window.posted = [];
        window.NativeShare = { postMessage: (m) => window.posted.push(m) };
    }

    const sandbox = { window, document, Image: ImageMock, console: { log() { }, warn() { }, error() { } } };
    vm.createContext(sandbox);
    vm.runInContext(shareSrc, sandbox);
    return { window, document, els, tracks };
}

const SPOT = {
    id: 'ABC123xyz', title: '토요일 저녁 6인제 픽업', sport: '6s', level: 'any',
    beginner_friendly: true, english_ok: true, this_week: '이번주 토 7시 잠실',
    schedule: '토 19:00~22:00', fee_info: '보통 1만원·현장',
    venue_name: '잠실학생체육관', address: '서울 송파구 올림픽로 25'
};

describe('buildSpotShareUrl', () => {
    test('?spot= 딥링크 URL을 만든다', () => {
        const { window } = loadShare();
        assert.strictEqual(
            window.buildSpotShareUrl('ABC123xyz'),
            'https://nulloongzi.github.io/null_oongzi-do/?spot=ABC123xyz'
        );
    });
});

describe('generateSpotStoryCard', () => {
    test('9:16 PNG dataURL을 반환한다 (QR 있음)', async () => {
        const { window } = loadShare({ withQR: true });
        const url = await window.generateSpotStoryCard(SPOT);
        assert.ok(typeof url === 'string', '문자열이어야 함');
        assert.ok(url.startsWith('data:image/png'), 'PNG dataURL이어야 함');
    });

    test('QR 라이브러리가 없어도 카드 생성(폴백)', async () => {
        const { window } = loadShare({ withQR: false });
        const url = await window.generateSpotStoryCard(SPOT);
        assert.ok(url.startsWith('data:image/png'));
    });

    test('최소 필드(제목만)로도 동작', async () => {
        const { window } = loadShare({ withQR: true });
        const url = await window.generateSpotStoryCard({ id: 'x1', title: '픽업' });
        assert.ok(url.startsWith('data:image/png'));
    });
});

describe('shareSpotToStory — 네이티브 브리지(셸)', () => {
    test('NativeShare로 ig_story 계약 JSON을 전송한다', async () => {
        const { window, tracks } = loadShare({ withQR: true, nativeShare: true });
        const result = await window.shareSpotToStory(SPOT);

        assert.strictEqual(result, 'ig_story');
        assert.strictEqual(window.posted.length, 1, '메시지 1건 전송');

        const payload = JSON.parse(window.posted[0]);
        assert.strictEqual(payload.type, 'ig_story');
        assert.ok(payload.stickerImage.startsWith('data:image/png'), 'stickerImage=PNG dataURL');
        assert.strictEqual(payload.contentUrl, 'https://nulloongzi.github.io/null_oongzi-do/?spot=ABC123xyz');
        assert.strictEqual(payload.topColor, '#fff8e1');
        assert.strictEqual(payload.bottomColor, '#fac710');

        // 계측: method=ig_story
        const ev = tracks.find(t => t.name === 'share');
        assert.ok(ev && ev.params.method === 'ig_story' && ev.params.spot_id === 'ABC123xyz');
    });
});

describe('shareSpotToStory — 브라우저 폴백', () => {
    test('브리지 없으면 카드 미리보기 오버레이를 띄운다', async () => {
        const { window, els, tracks } = loadShare({ withQR: true });
        const result = await window.shareSpotToStory(SPOT);

        assert.strictEqual(result, 'story_card');
        assert.strictEqual(els.previewOverlay.style.display, 'flex', '미리보기 오버레이 표시');
        const ev = tracks.find(t => t.name === 'share');
        assert.ok(ev && ev.params.method === 'story_card');
    });

    test('카드 생성 실패 시 기본 sharePickup으로 폴백', async () => {
        const { window } = loadShare({ throwToDataURL: true });
        let pickupCalledWith = null;
        window.sharePickup = (s) => { pickupCalledWith = s; };   // 런타임에 동적 호출됨

        const result = await window.shareSpotToStory(SPOT);
        assert.strictEqual(result, 'fallback');
        assert.ok(pickupCalledWith === SPOT, 'sharePickup(spot)로 폴백');
    });

    test('spot/ id 없으면 안전하게 무시', async () => {
        const { window } = loadShare();
        await window.shareSpotToStory(null);
        await window.shareSpotToStory({ title: 'no id' });
        // throw 없이 통과하면 OK
    });
});
