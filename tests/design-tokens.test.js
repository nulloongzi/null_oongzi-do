// tests/design-tokens.test.js — tokens/design-tokens.json 이 웹·앱 토큰의 유일한 원본인지 지킨다.
// css/main.css :root 는 생성 블록이라 손으로 고치면 여기서 걸린다(npm run tokens 로 다시 만든다).
// 앱 lib/design_tokens.g.dart 쪽은 앱 저장소 .github/workflows/design-tokens.yml 이 같은 생성기로 본다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderCss, renderDart, replaceCssBlock, dartColor, loadTokens } = require('../scripts/build-tokens.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'main.css'), 'utf-8');
const tokens = loadTokens();

describe('디자인 토큰', () => {
    test('css/main.css 의 :root 생성 블록이 JSON 과 같다', () => {
        assert.strictEqual(replaceCssBlock(css, renderCss(tokens)), css,
            'css/main.css :root 가 tokens/design-tokens.json 과 다르다 — npm run tokens');
    });

    test('생성 블록 밖에서 토큰 변수를 다시 정의하지 않는다', () => {
        const outside = replaceCssBlock(css, '');
        const names = [].concat(tokens.color, tokens.shadow, tokens.radius).map((x) => x.css);
        names.forEach((n) => assert.ok(!outside.includes(n + ':'), n + ' 이 생성 블록 밖에서 정의됐다'));
    });

    test('CSS 변수·Dart 이름이 겹치지 않는다', () => {
        const all = [].concat(tokens.color, tokens.shadow, tokens.radius);
        const cssNames = all.map((x) => x.css);
        assert.strictEqual(new Set(cssNames).size, cssNames.length);
        const dartColors = tokens.color.filter((c) => c.dart).map((c) => c.dart)
            .concat(tokens.shadow.map((s) => s.dartColor));
        assert.strictEqual(new Set(dartColors).size, dartColors.length);
    });

    test('rgba 알파를 Flutter ARGB 로 옮긴다', () => {
        assert.strictEqual(dartColor('#fac710'), 'Color(0xFFFAC710)');
        assert.strictEqual(dartColor('rgba(93, 64, 55, 0.35)'), 'Color(0x595D4037)');
        assert.strictEqual(dartColor('rgba(93, 64, 55, 0.15)'), 'Color(0x265D4037)');
        assert.strictEqual(dartColor('rgba(255, 255, 255, 0.85)'), 'Color(0xD9FFFFFF)');
    });

    test('그림자는 갈색만 쓴다 (검정 금지)', () => {
        tokens.shadow.forEach((s) => assert.match(s.color, /^rgba\(93, 64, 55,/, s.css));
    });

    test('Dart 파일에 모든 앱 토큰이 들어간다', () => {
        const dart = renderDart(tokens);
        tokens.color.filter((c) => c.dart).forEach((c) => assert.ok(dart.includes('static const ' + c.dart + ' = '), c.dart));
        tokens.radius.forEach((r) => assert.ok(dart.includes('static const ' + r.dart + ' = ' + r.value.toFixed(1)), r.dart));
    });
});
