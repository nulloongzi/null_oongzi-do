// tests/assetlinks.test.js — .well-known/assetlinks.json 의 App Link 범위.
//
// 앱이 do.nulloongzi.com 을 App Link 로 선언하면서 경로를 가리지 않아, 웹 카카오·네이버 로그인의
// 복귀 주소(?code=&state=)까지 앱이 가로챘다 — 웹 로그인이 끊기고 앱 첫 화면만 열렸다.
// 안드로이드 15+ 는 여기 적힌 동적 규칙(dynamic_app_link_components)으로 앱이 여는 주소를 좁힌다.
// 규칙은 위에서부터 처음 맞는 것 하나로 정해지므로, 순서가 곧 의미다 — 그래서 실제 주소로 확인한다.
//
// 매칭 규칙은 developer.android.com/training/app-links/configure-assetlinks 의 설명을 옮겼다:
//   '*' 0자 이상 · '?' 1자 · '?*' 1자 이상 / '?' 조건은 적힌 키가 모두 맞아야 한다 / 맞는 규칙이 없으면 앱이 열지 않는다.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const links = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.well-known', 'assetlinks.json'), 'utf-8'));

function globToRegExp(p) {
    let out = '';
    for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (c === '?' && p[i + 1] === '*') { out += '.+'; i++; }
        else if (c === '*') out += '.*';
        else if (c === '?') out += '.';
        else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + out + '$');
}
function ruleMatches(rule, url) {
    if (rule['/'] != null && !globToRegExp(rule['/']).test(url.pathname)) return false;
    if (rule['#'] != null && !globToRegExp(rule['#']).test(url.hash.replace(/^#/, ''))) return false;
    if (rule['?']) {
        for (const [k, v] of Object.entries(rule['?'])) {
            if (!url.searchParams.has(k) || !globToRegExp(v).test(url.searchParams.get(k))) return false;
        }
    }
    return true;
}
function opensApp(href) {
    const rules = links[0].relation_extensions['delegate_permission/common.handle_all_urls'].dynamic_app_link_components;
    const url = new URL(href);
    for (const r of rules) if (ruleMatches(r, url)) return !r.exclude;
    return false;
}

describe('App Link 범위 (안드로이드 15+ 동적 규칙)', () => {
    test('검증 항목(패키지·지문)은 그대로 — 동적 규칙은 덧붙이기만 한다', () => {
        assert.strictEqual(links.length, 1);
        assert.deepStrictEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
        assert.strictEqual(links[0].target.package_name, 'com.nulloongzi.nulloongzido');
        assert.strictEqual(links[0].target.sha256_cert_fingerprints.length, 2);
    });

    test('공유 링크·초대 링크·첫 화면은 앱이 연다', () => {
        for (const u of [
            'https://do.nulloongzi.com/',
            'https://do.nulloongzi.com/?club=abc123',
            'https://do.nulloongzi.com/?spot=XYZ',
            'https://do.nulloongzi.com/?invite=NRJ7K2'
        ]) assert.strictEqual(opensApp(u), true, u);
    });

    test('로그인 복귀(?code=&state= / ?error=&state=)는 브라우저에 남는다', () => {
        for (const u of [
            'https://do.nulloongzi.com/?code=AbC&state=naver_x1',
            'https://do.nulloongzi.com/?code=AbC&state=kakao_x1',
            'https://do.nulloongzi.com/?error=access_denied&state=naver_x1',
            'https://do.nulloongzi.com/?state=',
            'https://do.nulloongzi.com/auth/callback/?code=AbC&state=naver_x1',
            'https://do.nulloongzi.com/auth/callback/'
        ]) assert.strictEqual(opensApp(u), false, u);
    });

    test('웹 전용 페이지(약관·개인정보·안치기 등)는 브라우저에 남는다', () => {
        for (const u of [
            'https://do.nulloongzi.com/privacy.html',
            'https://do.nulloongzi.com/terms.html',
            'https://do.nulloongzi.com/guidelines.html',
            'https://do.nulloongzi.com/data-deletion.html',
            'https://do.nulloongzi.com/anchigi.html',
            'https://do.nulloongzi.com/.well-known/assetlinks.json'
        ]) assert.strictEqual(opensApp(u), false, u);
    });
});
