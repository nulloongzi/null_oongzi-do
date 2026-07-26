// tests/functions-provider-http.test.js
// 소셜 로그인 HTTP 경로 검증 — 에뮬레이터/네트워크 불필요.
// 로컬 HTTPS 서버를 카카오인 척 세워두고 https.request를 그쪽으로 돌린 뒤,
// 실제 functions/social-auth.js 핸들러를 .run()으로 호출한다.
//
// 핵심 회귀 방지: 전역 fetch(undici)가 붙이는 accept-language: * / sec-fetch-mode 가
// 요청에 섞이면 카카오 엣지가 406 not_acceptable(KOE001)을 돌려준다.
// 나가는 헤더 집합 자체를 여기서 고정한다.
//
// 실행: node --test tests/functions-provider-http.test.js

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// ── 자체 서명 인증서로 로컬 HTTPS 서버 준비 ──
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nulloong-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048',
    '-keyout', path.join(certDir, 'k.pem'), '-out', path.join(certDir, 'c.pem'),
    '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'ignore' });

let server;
let port;
let received = [];      // 서버가 받은 요청 기록
let responder = null;   // 테스트별 응답 규칙

function startServer() {
    return new Promise((resolve) => {
        server = https.createServer({
            key: fs.readFileSync(path.join(certDir, 'k.pem')),
            cert: fs.readFileSync(path.join(certDir, 'c.pem'))
        }, (req, res) => {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                const entry = {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: Buffer.concat(chunks).toString(),
                    host: req.headers.host // 패치가 원래 목적지 호스트를 그대로 실어 보낸다
                };
                received.push(entry);
                const out = responder ? responder(entry) : { status: 200, body: '{}' };
                res.writeHead(out.status, { 'Content-Type': 'application/json' });
                res.end(out.body);
            });
        });
        server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); });
    });
}

// https.request를 가로채 로컬 서버로 보낸다.
// 원래 목적지는 Host 헤더로 보존해서 "어느 호스트로 쏘려 했는지"를 검증할 수 있게 한다.
const realRequest = https.request;
function patchHttps() {
    https.request = function (options, cb) {
        const targetHost = options.host || options.hostname;
        const patched = Object.assign({}, options, {
            host: '127.0.0.1', hostname: '127.0.0.1', port,
            rejectUnauthorized: false,
            servername: 'localhost',
            headers: Object.assign({}, options.headers, { host: targetHost })
        });
        return realRequest.call(https, patched, cb);
    };
}

// ── 테스트 대상 로드 (firebase-admin은 스텁으로 교체) ──
let socialAuth;
let providerHttp;

before(async () => {
    await startServer();
    patchHttps();

    // admin.auth 는 FirebaseNamespace의 접근자라 단순 대입이 먹지 않는다 → defineProperty로 교체.
    // (실제 커스텀 토큰 서명은 서비스 계정 키가 필요하므로 여기서만 스텁)
    const admin = require('../functions/node_modules/firebase-admin');
    Object.defineProperty(admin, 'auth', {
        value: () => ({
            createCustomToken: async (uid, claims) => 'CUSTOM:' + uid + ':' + JSON.stringify(claims)
        }),
        writable: true,
        configurable: true
    });

    process.env.KAKAO_REST_API_KEY = '  restkey123  \n'; // 앞뒤 공백/개행 일부러 섞음
    process.env.KAKAO_CLIENT_SECRET = 'secret456';
    process.env.NAVER_CLIENT_SECRET = 'nsecret';
    // defineString의 default는 배포 시 CLI가 함수 환경변수로 구워 넣는다.
    // 로컬 테스트 프로세스에는 그 주입이 없으므로 직접 세팅한다.
    process.env.NAVER_CLIENT_ID = '41TDNsngcV0J7W6ICtDj';

    providerHttp = require('../functions/lib/provider-http');
    socialAuth = require('../functions/social-auth');
});

after(() => {
    https.request = realRequest;
    if (server) server.close();
    fs.rmSync(certDir, { recursive: true, force: true });
});

function reset(fn) { received = []; responder = fn; }

describe('provider-http: 나가는 헤더', () => {
    test('postForm은 undici 기본 헤더(accept-language/sec-fetch-mode)를 보내지 않는다', async () => {
        reset(() => ({ status: 200, body: '{"ok":true}' }));
        await providerHttp.postForm('kauth.kakao.com', '/oauth/token', 'grant_type=x');

        const h = received[0].headers;
        // 406(Accept-* 협상 실패)을 유발하던 헤더들이 없어야 한다
        assert.strictEqual(h['accept-language'], undefined, 'accept-language가 나가면 안 됨');
        assert.strictEqual(h['sec-fetch-mode'], undefined, 'sec-fetch-mode가 나가면 안 됨');
        assert.notStrictEqual(h['user-agent'], 'node', 'undici 기본 UA가 그대로면 안 됨');
        // 우리가 의도한 헤더는 있어야 한다
        assert.strictEqual(h['content-type'], 'application/x-www-form-urlencoded;charset=utf-8');
        assert.strictEqual(h['accept'], 'application/json');
        assert.strictEqual(h['user-agent'], 'nulloongzi-do-functions/1.0');
        assert.strictEqual(h['content-length'], '12');
        assert.strictEqual(received[0].body, 'grant_type=x');
    });

    test('postForm에 accessToken을 주면 Bearer 헤더가 붙는다', async () => {
        reset(() => ({ status: 200, body: '{}' }));
        await providerHttp.postForm('kapi.kakao.com', '/v2/api/talk/memo/default/send', 'template_object=%7B%7D', 'AT');
        assert.strictEqual(received[0].headers.authorization, 'Bearer AT');
    });

    test('getWithToken / getJson도 같은 헤더 정책', async () => {
        reset(() => ({ status: 200, body: '{}' }));
        await providerHttp.getWithToken('kapi.kakao.com', '/v2/user/me', 'AT');
        await providerHttp.getJson('nid.naver.com', '/oauth2.0/token?x=1');
        for (const r of received) {
            assert.strictEqual(r.headers['accept-language'], undefined);
            assert.strictEqual(r.headers['sec-fetch-mode'], undefined);
            assert.strictEqual(r.headers['user-agent'], 'nulloongzi-do-functions/1.0');
        }
        assert.strictEqual(received[0].headers.authorization, 'Bearer AT');
        assert.strictEqual(received[1].headers.authorization, undefined);
    });

    test('4xx/5xx여도 throw하지 않고 status/body를 그대로 돌려준다', async () => {
        reset(() => ({ status: 406, body: '{"error":"not_acceptable","error_code":"KOE001"}' }));
        const res = await providerHttp.postForm('kauth.kakao.com', '/oauth/token', 'a=1');
        assert.strictEqual(res.status, 406);
        assert.strictEqual(providerHttp.parseJson(res.body).error_code, 'KOE001');
    });
});

describe('provider-http: parseJson / secretValue', () => {
    test('parseJson은 어떤 입력에도 throw하지 않는다', () => {
        assert.deepStrictEqual(providerHttp.parseJson('<html>502 Bad Gateway</html>'), {});
        assert.deepStrictEqual(providerHttp.parseJson(''), {});
        assert.deepStrictEqual(providerHttp.parseJson('null'), {});
        assert.deepStrictEqual(providerHttp.parseJson('"문자열"'), {});
        assert.deepStrictEqual(providerHttp.parseJson('{"a":1}'), { a: 1 });
    });

    test('secretValue는 앞뒤 공백/개행을 제거한다 (secrets:set 붙여넣기 사고 방지)', () => {
        assert.strictEqual(providerHttp.secretValue({ value: () => '  key\n' }), 'key');
        assert.strictEqual(providerHttp.secretValue({ value: () => undefined }), '');
        assert.strictEqual(providerHttp.secretValue({ value: () => { throw new Error('미설정'); } }), '');
        assert.strictEqual(providerHttp.secretValue(null), '');
    });
});

describe('kakaoCustomToken 핸들러 (실제 코드 .run 호출)', () => {
    test('정상 흐름: code 교환 → 토큰 검증 → 사용자 조회 → 커스텀 토큰', async () => {
        reset((req) => {
            if (req.url === '/oauth/token') return { status: 200, body: '{"access_token":"AT-1"}' };
            if (req.url === '/v1/user/access_token_info') return { status: 200, body: '{"app_id":111}' };
            if (req.url === '/v2/user/me') return { status: 200, body: '{"id":98765}' };
            return { status: 404, body: '{}' };
        });

        const out = await socialAuth.kakaoCustomToken.run({
            data: { code: 'AUTHCODE', redirectUri: 'https://nulloongzi.github.io/null_oongzi-do/' }
        });

        assert.strictEqual(out.token, 'CUSTOM:kakao:98765:{"provider":"kakao"}');

        // 토큰 교환 요청이 카카오 규격대로 나갔는지
        const tokenReq = received.find((r) => r.url === '/oauth/token');
        assert.strictEqual(tokenReq.host, 'kauth.kakao.com');
        assert.match(tokenReq.body, /grant_type=authorization_code/);
        assert.match(tokenReq.body, /code=AUTHCODE/);
        assert.match(tokenReq.body, /client_secret=secret456/);
        // 시크릿에 섞인 공백/개행이 client_id를 오염시키지 않아야 한다
        assert.match(tokenReq.body, /client_id=restkey123(&|$)/);
        assert.ok(!tokenReq.body.includes('%0A'), 'client_id에 개행이 새어나감');
        // 사용자 조회는 kapi 호스트 + Bearer
        const meReq = received.find((r) => r.url === '/v2/user/me');
        assert.strictEqual(meReq.host, 'kapi.kakao.com');
        assert.strictEqual(meReq.headers.authorization, 'Bearer AT-1');
    });

    test('406/KOE001: 에러 메시지에 카카오 코드가 실리고 진단 프로브가 발사된다', async () => {
        reset(() => ({ status: 406, body: '{"error":"not_acceptable","error_code":"KOE001"}' }));

        await assert.rejects(
            () => socialAuth.kakaoCustomToken.run({
                data: { code: 'AUTHCODE', redirectUri: 'https://x/' }
            }),
            (err) => {
                assert.match(err.message, /KOE001/);
                return true;
            }
        );

        // 교환 1회 + 원인 분류 프로브 1회
        const tokenCalls = received.filter((r) => r.url === '/oauth/token');
        assert.strictEqual(tokenCalls.length, 2);
        assert.match(tokenCalls[0].body, /grant_type=authorization_code/);
        assert.match(tokenCalls[1].body, /grant_type=refresh_token/, '프로브는 refresh_token으로 나가야 함');
    });

    test('앱 네이티브 흐름(accessToken 직접 전달)은 토큰 교환을 건너뛴다', async () => {
        reset((req) => {
            if (req.url === '/v1/user/access_token_info') return { status: 200, body: '{"app_id":111}' };
            if (req.url === '/v2/user/me') return { status: 200, body: '{"id":42}' };
            return { status: 404, body: '{}' };
        });
        const out = await socialAuth.kakaoCustomToken.run({ data: { accessToken: 'NATIVE-AT' } });
        assert.strictEqual(out.token, 'CUSTOM:kakao:42:{"provider":"kakao"}');
        assert.strictEqual(received.filter((r) => r.url === '/oauth/token').length, 0);
    });

    test('code/redirectUri 둘 다 없으면 invalid-argument', async () => {
        reset(() => ({ status: 200, body: '{}' }));
        await assert.rejects(
            () => socialAuth.kakaoCustomToken.run({ data: {} }),
            (err) => err.code === 'invalid-argument'
        );
        assert.strictEqual(received.length, 0);
    });

    test('kapi가 HTML을 뱉어도(엣지 차단) throw 없이 unauthenticated로 떨어진다', async () => {
        reset((req) => {
            if (req.url === '/oauth/token') return { status: 200, body: '{"access_token":"AT-1"}' };
            return { status: 406, body: '<html>Not Acceptable</html>' };
        });
        await assert.rejects(
            () => socialAuth.kakaoCustomToken.run({ data: { code: 'C', redirectUri: 'https://x/' } }),
            (err) => err.code === 'unauthenticated'
        );
    });
});

describe('naverCustomToken 핸들러', () => {
    test('code 교환 → /nid/me → 커스텀 토큰', async () => {
        reset((req) => {
            if (req.url.startsWith('/oauth2.0/token')) return { status: 200, body: '{"access_token":"NAT"}' };
            if (req.url === '/v1/nid/me') return { status: 200, body: '{"resultcode":"00","response":{"id":"n-7"}}' };
            return { status: 404, body: '{}' };
        });
        const out = await socialAuth.naverCustomToken.run({ data: { code: 'C', state: 'naver_abc' } });
        assert.strictEqual(out.token, 'CUSTOM:naver:n-7:{"provider":"naver"}');

        const tokenReq = received.find((r) => r.url.startsWith('/oauth2.0/token'));
        assert.strictEqual(tokenReq.host, 'nid.naver.com');
        assert.strictEqual(tokenReq.headers['accept-language'], undefined);
        assert.match(tokenReq.url, /state=naver_abc/);
        assert.strictEqual(received.find((r) => r.url === '/v1/nid/me').host, 'openapi.naver.com');
    });

    test('resultcode가 00이 아니면 거부', async () => {
        reset((req) => {
            if (req.url.startsWith('/oauth2.0/token')) return { status: 200, body: '{"access_token":"NAT"}' };
            return { status: 200, body: '{"resultcode":"024","message":"Authentication failed"}' };
        });
        await assert.rejects(
            () => socialAuth.naverCustomToken.run({ data: { code: 'C', state: 'naver_abc' } }),
            (err) => err.code === 'unauthenticated'
        );
    });
});
