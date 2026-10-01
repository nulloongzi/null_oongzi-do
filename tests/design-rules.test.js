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

    test('브라우저 기본 창(alert·confirm·prompt)을 쓰지 않는다 (design-references U12)', () => {
        // 2026-10-01: alert 66 · confirm 6 · prompt 6 → 0. 알림은 showToast(js/toast.js),
        // 입력 실수는 fieldError(js/field-error.js), 묻기는 nzConfirm·nzPrompt(js/dialog.js).
        const hits = [];
        fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).forEach((f) => {
            read('js/' + f).split('\n').forEach((line, i) => {
                const code = line.replace(/\/\/.*$/, '');
                if (/(^|[^\w.$])(alert|confirm|prompt)\(/.test(code)) hits.push('js/' + f + ':' + (i + 1));
            });
        });
        assert.deepStrictEqual(hits, [], '누룽지 모양으로: showToast · fieldError · nzConfirm · nzPrompt');
    });

    test('웹·앱 짝 문구의 웹 키가 모두 있다 (voice-and-tone)', () => {
        // 앱 문구와의 비교는 앱 CI(design-tokens.yml)가 --dart 로 한다. 여기선 키 이름이 사라지지 않았는지만
        const r = require('node:child_process').spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-copy-parity.js')], { encoding: 'utf-8' });
        assert.strictEqual(r.status, 0, r.stderr);
    });

    test('글자는 10px 이상 (design-references U8)', () => {
        // 표 칸처럼 빽빽한 곳도 10px 까지. 앱 test/design_rules_test.dart 와 같은 바닥
        const hits = [];
        SOURCES.forEach((f) => read(f).split('\n').forEach((line, i) => {
            const m = line.match(/font-size:\s*([0-9.]+)px/);
            if (m && parseFloat(m[1]) < 10) hits.push(f + ':' + (i + 1) + '  ' + m[0]);
        }));
        assert.deepStrictEqual(hits, [], '10px 미만 글자');
    });

    test('픽업 틸은 글자색으로 쓰지 않는다 — 흰 바탕 2.95:1 (design-references U4)', () => {
        // 테두리·핀·배경에만. 틸 계열 글자는 #0b6b64(6.36:1)
        const hits = [];
        SOURCES.forEach((f) => read(f).split('\n').forEach((line, i) => {
            if (/(^|[^-\w])color:\s*(var\(--pickup-teal\)|#13a89e)/i.test(line)) hits.push(f + ':' + (i + 1));
        }));
        assert.deepStrictEqual(hits, [], '틸 글자 → #0b6b64');
    });

    test('동호회/픽업 탭은 role=tab 버튼, 누르는 곳 44px (design-references U3·U5)', () => {
        const html = read('index.html');
        ['tabClubs', 'tabPickup'].forEach((id) => {
            const tag = (html.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>')) || [''])[0];
            assert.match(tag, /^<button type="button"[^>]*role="tab"[^>]*aria-selected="(true|false)"/, id);
        });
        const css = read('css/main.css');
        assert.match(css, /\.tab-btn::before \{[^}]*height: 44px/, '탭 누르는 곳 44px');
        assert.doesNotMatch(css.slice(css.indexOf('.tab-btn {'), css.indexOf('.tab-btn::before')), /#9e8e84/, '비활성 탭 글자 3.15:1');
    });

    test('영어 서비스 이름은 Nulloongzi-do 하나 (design-system §4)', () => {
        // 사람·브랜드 누룽지는 Nulloongzi(@null_oongzi). 소문자 파일명·패키지 ID(nulloongzido)와
        // 내부 이름(X-Nurungji-Skill-Key 등)은 화면 이름이 아니라서 대문자로 시작하는 표기만 본다
        const hits = [];
        PAGES.concat(['js/i18n.js', 'manifest.json']).forEach((f) => read(f).split('\n').forEach((line, i) => {
            if (/Nurungji-?do|Nulloongzido|Nulloongzi do\b/.test(line)) hits.push(f + ':' + (i + 1));
        }));
        assert.deepStrictEqual(hits, [], 'Nulloongzi-do 로');
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
