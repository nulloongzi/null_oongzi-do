// tests/design-rules.test.js — docs/design-system.md 규칙 중 코드로 잴 수 있는 것을 매 CI 에서 본다.
// 숫자 일치는 tests/design-tokens.test.js, 사람 눈이 필요한 것은 docs/visual-parity.md(반기 검수).
// 앱 쪽 같은 검사: 앱 저장소 test/design_rules_test.dart.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf-8');
// 실제로 배포되는 페이지만 (test*.html 은 옛 실험 페이지라 뺀다)
const PAGES = ['index.html', 'privacy.html', 'terms.html', 'guidelines.html', 'data-deletion.html', 'anchigi.html'];
const SOURCES = ['css/main.css']
    .concat(fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f))
    .concat(PAGES);

describe('디자인 규칙', () => {
    test('그림자는 갈색만 — 검정 그림자 금지 (§3)', () => {
        const black = /(box-shadow|text-shadow|drop-shadow|boxShadow|shadowColor)[^;\n]*(rgba\(\s*0\s*,\s*0\s*,\s*0\s*,|#000\b|\bblack\b)/i;
        const hits = [];
        SOURCES.forEach((f) => read(f).split('\n').forEach((line, i) => {
            if (black.test(line)) hits.push(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 120));
        }));
        assert.deepStrictEqual(hits, [], '검정 그림자 → rgba(93, 64, 55, …) 또는 var(--shadow)');
    });

    test('Pretendard 는 모든 페이지가 같은 고정 버전 (§2)', () => {
        const versions = new Set();
        PAGES.forEach((f) => {
            const m = read(f).match(/pretendard@([\d.]+)/g) || [];
            assert.ok(m.length, f + ' 에 Pretendard 링크가 없다');
            m.forEach((v) => versions.add(v));
        });
        assert.deepStrictEqual([...versions], ['pretendard@1.3.9'], '버전을 올릴 때는 모든 페이지와 앱 번들을 같이 바꾼다');
    });

    test('PWA 아이콘은 저장소 안의 브랜드 로고 (§3-1)', () => {
        const manifest = JSON.parse(read('manifest.json'));
        assert.ok(manifest.icons.length >= 2);
        manifest.icons.forEach((icon) => {
            assert.ok(!/^https?:/.test(icon.src), '외부 아이콘 금지: ' + icon.src);
            assert.ok(fs.existsSync(path.join(ROOT, icon.src)), '없는 파일: ' + icon.src);
        });
    });

    test('주황(--urgent-color) 바탕에 흰 글자 금지 — 2.7:1 (design-references U1)', () => {
        const css = read('css/main.css');
        const hits = [];
        const re = /\n\s*([^{}\n]+)\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(css))) {
            const body = m[2];
            const onUrgent = /background(-color)?:\s*(var\(--urgent-color\)|#ff7043)/i.test(body);
            const white = /(^|[^-\w])color:\s*(#fff\b|#ffffff\b|white\b)/i.test(body);
            if (onUrgent && white) hits.push(m[1].trim());
        }
        assert.deepStrictEqual(hits, [], '흰 글자는 var(--urgent-ink) 바탕에, 주황 바탕엔 진한 글자');
    });

    test('지도 위 버튼은 이름 있는 <button> (design-references U6)', () => {
        const html = read('index.html');
        ['fabLunchbox', 'fabProfile', 'fabClubRegister', 'fabPickupCreate'].forEach((id) => {
            const tag = (html.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>')) || [''])[0];
            assert.match(tag, /^<button type="button"/, id + ' 는 <button>');
            assert.match(tag, /data-i18n-aria="[a-z_]+"/, id + ' 에 이름(data-i18n-aria)');
        });
        const fabs = html.match(/<[a-z]+[^>]*class="fab-(btn|lunchbox|profile)[^"]*"[^>]*>/g) || [];
        assert.ok(fabs.length >= 5);
        fabs.forEach((tag) => assert.match(tag, /^<button[^>]*aria-label="[^"]+"/, tag));
    });

    test('시트 손잡이는 이름 있는 <button>, 닫힘 기준은 앱과 같은 0.6 (§3-1)', () => {
        const html = read('index.html');
        const tag = (html.match(/<[a-z]+[^>]*id="sheetHandle"[^>]*>/) || [''])[0];
        assert.match(tag, /^<button type="button"/, '#sheetHandle 는 <button>');
        assert.match(tag, /data-i18n-aria="sheet_close"/, '화면 낭독기 이름 "닫기"');
        // 앱 lib/widgets/map_detail_panel.dart kSheetCloseRatio 와 같은 값
        assert.match(read('js/club-detail.js'), /var SHEET_CLOSE_RATIO = 0\.6;/);
    });

    test('alert() 는 입력 검사 자리에만 남는다 — 알림은 showToast (design-references U12)', () => {
        // 2026-10-01 66곳 → 14곳. 남은 14곳은 입력 칸 옆 표시로 바꿀 차례라 줄기만 해야 한다.
        // 작은 성공·안내·일반 오류는 window.showToast(js/toast.js), 문구는 docs/voice-and-tone.md
        const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'toast.js');
        const count = files.reduce((n, f) => n + (read('js/' + f).match(/\balert\(/g) || []).length, 0);
        assert.ok(count <= 14, 'alert() ' + count + '곳 — 늘리지 말고 showToast 를 쓴다');
    });

    test('지도 위 버튼·시트 모서리는 토큰 변수로 (§3-1)', () => {
        const css = read('css/main.css');
        const rule = (sel) => {
            const i = css.indexOf('\n        ' + sel + ' {');
            assert.ok(i >= 0, sel + ' 규칙이 없다');
            return css.slice(i, css.indexOf('}', i));
        };
        ['.fab-btn', '.fab-lunchbox'].forEach((s) => assert.match(rule(s), /border-radius: var\(--radius-fab\)/, s));
        assert.match(rule('.fab-profile'), /border-radius: var\(--radius-fab-profile\)/);
        ['.bottom-sheet', '.pickup-list-panel'].forEach((s) => assert.match(rule(s), /var\(--radius-sheet\)/, s));
    });
});
