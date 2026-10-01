#!/usr/bin/env node
// build-tokens.js — tokens/design-tokens.json(유일한 원본)에서 웹·앱 토큰을 만든다.
//
//   node scripts/build-tokens.js                  css/main.css 의 :root 생성 블록을 다시 쓴다
//   node scripts/build-tokens.js --dart <파일>    앱 lib/design_tokens.g.dart 도 쓴다
//   node scripts/build-tokens.js --check [...]    쓰지 않고 비교만 — 다르면 exit 1 (CI)
//
// 앱 CI 는 이 저장소를 받아 `--check --dart lib/design_tokens.g.dart` 로 어긋남을 잡는다.
// 규칙과 쓰임은 docs/design-system.md.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TOKENS = path.join(ROOT, 'tokens', 'design-tokens.json');
const CSS = path.join(ROOT, 'css', 'main.css');
const BEGIN = '/* <design-tokens> 생성 블록 — 직접 고치지 말 것. 원본 tokens/design-tokens.json → npm run tokens */';
const END = '/* </design-tokens> */';

function parseColor(v) {
    let m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) return { rgb: m[1].toUpperCase(), a: 1 };
    m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(v);
    if (!m) throw new Error('지원하지 않는 색 형식: ' + v);
    const hex = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    return { rgb: hex(m[1]) + hex(m[2]) + hex(m[3]), a: Number(m[4]) };
}

function dartColor(v) {
    const c = parseColor(v);
    const a = Math.round(c.a * 255).toString(16).padStart(2, '0').toUpperCase();
    return 'Color(0x' + a + c.rgb + ')';
}

function renderCss(t) {
    const pad = '            ';
    const lines = [];
    t.color.forEach((c) => lines.push(pad + c.css + ': ' + c.value + '; /* ' + c.note + ' */'));
    t.shadow.forEach((s) => lines.push(pad + s.css + ': 0 ' + s.y + 'px ' + s.blur + 'px ' + s.color + '; /* ' + s.note + ' */'));
    t.radius.forEach((r) => lines.push(pad + r.css + ': ' + r.value + 'px; /* ' + r.note + ' */'));
    return ['        ' + BEGIN, '        :root {'].concat(lines, ['        }', '        ' + END]).join('\n');
}

function renderDart(t) {
    const out = [
        '// design_tokens.g.dart — 생성 파일. 직접 고치지 말 것.',
        '// 원본: 웹 저장소 nulloongzi/null_oongzi-do 의 tokens/design-tokens.json',
        '// 다시 만들기(웹 저장소에서):',
        '//   npm run tokens -- --dart ../null_oongzi-do-app/lib/design_tokens.g.dart',
        '// 규칙과 쓰임: 웹 docs/design-system.md · CI: .github/workflows/design-tokens.yml',
        "import 'package:flutter/painting.dart';",
        '',
        '/// 누룽지 색 — 웹 css/main.css :root 와 같은 값.',
        'class NurungjiColors {',
    ];
    t.color.filter((c) => c.dart).forEach((c) => {
        out.push('  static const ' + c.dart + ' = ' + dartColor(c.value) + '; // ' + c.css);
    });
    t.shadow.forEach((s) => {
        out.push('  static const ' + s.dartColor + ' = ' + dartColor(s.color) + '; // ' + s.css + ' 색');
    });
    out.push('}', '', '/// 그림자 — 갈색만(검정 금지).', 'class NurungjiShadows {');
    t.shadow.forEach((s) => {
        out.push(
            '  // ' + s.css + ': ' + s.note,
            '  static const ' + s.dart + ' = BoxShadow(',
            '    color: NurungjiColors.' + s.dartColor + ',',
            '    blurRadius: ' + s.blur + ',',
            '    offset: Offset(0, ' + s.y + '),',
            '  );',
        );
    });
    out.push('}', '', '/// 모서리 — 웹 --radius-* 와 같은 값.', 'class NurungjiRadius {');
    t.radius.forEach((r) => {
        out.push('  static const ' + r.dart + ' = ' + r.value.toFixed(1) + '; // ' + r.css + ' · ' + r.note);
    });
    out.push('}', '');
    return out.join('\n');
}

function replaceCssBlock(css, block) {
    const i = css.indexOf(BEGIN), j = css.indexOf(END);
    if (i < 0 || j < i) throw new Error('css/main.css 에 생성 블록 표시(<design-tokens>)가 없다');
    const start = css.lastIndexOf('\n', i) + 1;
    return css.slice(0, start) + block + css.slice(j + END.length);
}

function loadTokens() {
    return JSON.parse(fs.readFileSync(TOKENS, 'utf-8'));
}

function main(argv) {
    const check = argv.includes('--check');
    const di = argv.indexOf('--dart');
    const dartPath = di >= 0 ? argv[di + 1] : null;
    if (di >= 0 && !dartPath) throw new Error('--dart 뒤에 파일 경로가 필요하다');
    const t = loadTokens();
    const targets = [{ file: CSS, want: replaceCssBlock(fs.readFileSync(CSS, 'utf-8'), renderCss(t)) }];
    if (dartPath) targets.push({ file: path.resolve(dartPath), want: renderDart(t) });

    let stale = 0;
    targets.forEach(({ file, want }) => {
        const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
        if (have === want) return;
        if (check) {
            stale++;
            console.error('어긋남: ' + file + ' — tokens/design-tokens.json 과 다르다. 웹 저장소에서 npm run tokens 로 다시 만든다.');
        } else {
            fs.writeFileSync(file, want);
            console.log('썼다: ' + file);
        }
    });
    if (check && !stale) console.log('토큰 일치: ' + targets.map((x) => path.basename(x.file)).join(', '));
    return stale ? 1 : 0;
}

if (require.main === module) {
    try {
        process.exitCode = main(process.argv.slice(2));
    } catch (e) {
        console.error(e.message);
        process.exitCode = 2;
    }
}

module.exports = { renderCss, renderDart, replaceCssBlock, dartColor, loadTokens, BEGIN, END };
