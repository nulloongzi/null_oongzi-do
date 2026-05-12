// tests/dom-utils.test.js
// Phase 1-3 출력 escape 헬퍼 자동 검증.
// 실행: node --test tests/dom-utils.test.js
//
// js/dom-utils.js 는 IIFE로 window.* 에 헬퍼를 할당하는 classic script.
// Node에서 window를 mock한 뒤 vm으로 IIFE를 실행해 헬퍼를 캡처한다.

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'js', 'dom-utils.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf-8');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(scriptSource, sandbox);
const { escapeHtml, sanitizeUrl, sanitizeInstaHandle, sanitizeFilename } = sandbox.window;

describe('escapeHtml', () => {
    test('escapes 5 HTML special chars', () => {
        assert.strictEqual(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
    });

    test('escapes XSS payload onerror', () => {
        const out = escapeHtml('<img src=x onerror=alert(1)>');
        assert.ok(!out.includes('<img'), '< must be escaped');
        assert.ok(out.includes('&lt;img'));
        assert.strictEqual(out, '&lt;img src=x onerror=alert(1)&gt;');
    });

    test('escapes script tag payload', () => {
        const out = escapeHtml('</div><script>alert("x")</script>');
        assert.ok(!out.includes('<script'));
        assert.ok(out.includes('&lt;/div&gt;&lt;script&gt;'));
    });

    test('handles null/undefined as empty string', () => {
        assert.strictEqual(escapeHtml(null), '');
        assert.strictEqual(escapeHtml(undefined), '');
    });

    test('preserves Korean text', () => {
        assert.strictEqual(escapeHtml('현미밥 동호회'), '현미밥 동호회');
    });

    test('coerces non-string input', () => {
        assert.strictEqual(escapeHtml(123), '123');
        assert.strictEqual(escapeHtml(0), '0');
    });

    test('escapes attribute-breaking quotes', () => {
        assert.strictEqual(escapeHtml('";onclick="alert(1)'), '&quot;;onclick=&quot;alert(1)');
    });
});

describe('sanitizeUrl', () => {
    test('passes https URL through', () => {
        assert.strictEqual(sanitizeUrl('https://example.com/path'), 'https://example.com/path');
    });

    test('passes http URL through', () => {
        assert.strictEqual(sanitizeUrl('http://nulloongzido.com'), 'http://nulloongzido.com');
    });

    test('passes mailto scheme', () => {
        assert.strictEqual(sanitizeUrl('mailto:a@b.com'), 'mailto:a@b.com');
    });

    test('passes tel scheme', () => {
        assert.strictEqual(sanitizeUrl('tel:01012345678'), 'tel:01012345678');
    });

    test('blocks javascript: scheme', () => {
        assert.strictEqual(sanitizeUrl('javascript:alert(1)'), '#');
    });

    test('blocks javascript: with case variation', () => {
        assert.strictEqual(sanitizeUrl('JavaScript:alert(1)'), '#');
        assert.strictEqual(sanitizeUrl('JAVASCRIPT:alert(1)'), '#');
    });

    test('blocks data: scheme', () => {
        assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');
    });

    test('blocks vbscript: scheme', () => {
        assert.strictEqual(sanitizeUrl('vbscript:msgbox(1)'), '#');
    });

    test('blocks file: scheme', () => {
        assert.strictEqual(sanitizeUrl('file:///etc/passwd'), '#');
    });

    test('blocks ftp: scheme', () => {
        assert.strictEqual(sanitizeUrl('ftp://example.com'), '#');
    });

    test('blocks protocol-relative URL', () => {
        assert.strictEqual(sanitizeUrl('//evil.com'), '#');
    });

    test('blocks relative path', () => {
        assert.strictEqual(sanitizeUrl('/path'), '#');
        assert.strictEqual(sanitizeUrl('path'), '#');
    });

    test('returns empty for empty/null input', () => {
        assert.strictEqual(sanitizeUrl(''), '');
        assert.strictEqual(sanitizeUrl(null), '');
        assert.strictEqual(sanitizeUrl(undefined), '');
    });

    test('trims whitespace', () => {
        assert.strictEqual(sanitizeUrl('  https://example.com  '), 'https://example.com');
    });

    test('blocks leading space + javascript:', () => {
        // 일부 브라우저는 leading whitespace를 무시. trim 후 검사하므로 차단되어야 함.
        assert.strictEqual(sanitizeUrl('  javascript:alert(1)'), '#');
    });
});

describe('sanitizeInstaHandle', () => {
    test('accepts valid handle', () => {
        assert.strictEqual(sanitizeInstaHandle('valid_user.123'), 'valid_user.123');
    });

    test('strips leading @', () => {
        assert.strictEqual(sanitizeInstaHandle('@username'), 'username');
    });

    test('rejects HTML tags', () => {
        assert.strictEqual(sanitizeInstaHandle('<script>'), '');
    });

    test('rejects attribute-break payload', () => {
        assert.strictEqual(sanitizeInstaHandle('";onclick="alert(1)'), '');
    });

    test('rejects hyphen (not allowed by Instagram spec)', () => {
        assert.strictEqual(sanitizeInstaHandle('user-name'), '');
    });

    test('rejects spaces', () => {
        assert.strictEqual(sanitizeInstaHandle('user name'), '');
    });

    test('rejects forward slash (path injection)', () => {
        assert.strictEqual(sanitizeInstaHandle('user/profile'), '');
    });

    test('rejects over 30 chars', () => {
        assert.strictEqual(sanitizeInstaHandle('a'.repeat(31)), '');
    });

    test('accepts exactly 30 chars', () => {
        assert.strictEqual(sanitizeInstaHandle('a'.repeat(30)), 'a'.repeat(30));
    });

    test('returns empty for empty/null input', () => {
        assert.strictEqual(sanitizeInstaHandle(''), '');
        assert.strictEqual(sanitizeInstaHandle(null), '');
        assert.strictEqual(sanitizeInstaHandle(undefined), '');
    });
});

describe('sanitizeFilename', () => {
    test('removes forward slashes (단일 segment 보장)', () => {
        // Firebase Storage 경로 규칙은 {fileName} 와일드카드가 단일 segment만 매치하므로
        // 핵심은 '/'와 '\\' 제거. '..'는 Storage에서 traversal 의미가 없는 단순 문자.
        const out = sanitizeFilename('../etc/passwd');
        assert.ok(!out.includes('/'), 'forward slash must be removed');
        assert.ok(!out.includes('\\'), 'backslash must be removed');
    });

    test('replaces backslash', () => {
        assert.ok(!sanitizeFilename('a\\b\\c.jpg').includes('\\'));
    });

    test('replaces colon (Windows drive)', () => {
        assert.ok(!sanitizeFilename('C:\\evil.jpg').includes(':'));
    });

    test('replaces control characters', () => {
        const out = sanitizeFilename('a\x00b\x1fc.jpg');
        assert.ok(!out.includes('\x00'));
        assert.ok(!out.includes('\x1f'));
    });

    test('replaces special chars with _', () => {
        // ; < > & ? * | ( ) [ ] 등은 _ 로 치환
        const out = sanitizeFilename('photo;<>&?.jpg');
        assert.match(out, /^photo_\.jpg$/, 'special chars collapsed to single _');
    });

    test('preserves alphanumeric + ._-', () => {
        assert.strictEqual(sanitizeFilename('photo_2026-05-12.v1.jpg'), 'photo_2026-05-12.v1.jpg');
    });

    test('truncates to 80 chars preserving extension', () => {
        const long = 'a'.repeat(100) + '.jpg';
        const out = sanitizeFilename(long);
        assert.ok(out.length <= 80);
        assert.ok(out.endsWith('.jpg'), 'extension preserved');
    });

    test('truncates without extension when no dot near end', () => {
        const out = sanitizeFilename('a'.repeat(100));
        assert.strictEqual(out.length, 80);
    });

    test('returns "photo" default for empty', () => {
        assert.strictEqual(sanitizeFilename(''), 'photo');
        assert.strictEqual(sanitizeFilename(null), 'photo');
        assert.strictEqual(sanitizeFilename(undefined), 'photo');
    });

    test('preserves Korean filename as transliterated _', () => {
        // 한글은 [^A-Za-z0-9._-]에 매치되어 _로 치환됨. 의도된 동작.
        const out = sanitizeFilename('사진.jpg');
        assert.match(out, /^_\.jpg$|^_+\.jpg$/);
    });
});

describe('XSS payload regression matrix (end-to-end through escapeHtml)', () => {
    const payloads = [
        '<img src=x onerror=alert(1)>',
        '<script>alert(1)</script>',
        '"><svg onload=alert(1)>',
        "';alert(1);//",
        '<iframe src=javascript:alert(1)>',
        '<body onload=alert(1)>',
        '<a href="javascript:alert(1)">x</a>',
        '<details open ontoggle=alert(1)>',
    ];
    for (const p of payloads) {
        test(`payload "${p.slice(0, 40)}..." has no raw <`, () => {
            const out = escapeHtml(p);
            assert.ok(!out.includes('<'), '< must not appear unescaped in output');
            assert.ok(!out.includes('>'), '> must not appear unescaped in output');
        });
    }
});
