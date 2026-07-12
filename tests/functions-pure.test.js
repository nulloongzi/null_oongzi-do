// tests/functions-pure.test.js
// Cloud Functions 순수 로직(functions/lib/pure.js) 검증 — 에뮬레이터 불필요.
// 실행: node --test tests/functions-pure.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert');

const pure = require('../functions/lib/pure');

describe('generateToken (HMAC 승인/거절 링크)', () => {
    test('결정적 + 16자 hex', () => {
        const a = pure.generateToken('secret', 'req-1', 'approve');
        const b = pure.generateToken('secret', 'req-1', 'approve');
        assert.strictEqual(a, b);
        assert.match(a, /^[0-9a-f]{16}$/);
    });
    test('secret/requestId/action 어느 하나만 달라도 토큰 상이', () => {
        const base = pure.generateToken('secret', 'req-1', 'approve');
        assert.notStrictEqual(pure.generateToken('other', 'req-1', 'approve'), base);
        assert.notStrictEqual(pure.generateToken('secret', 'req-2', 'approve'), base);
        assert.notStrictEqual(pure.generateToken('secret', 'req-1', 'reject'), base);
    });
});

describe('escapeHtml / renderResultPage (XSS 방지)', () => {
    test('특수문자 5종 이스케이프', () => {
        assert.strictEqual(
            pure.escapeHtml('<img src=x onerror="a">&\'b\''),
            '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;b&#39;'
        );
        assert.strictEqual(pure.escapeHtml(null), '');
    });
    test('악성 club_name이 결과 페이지에서 무해화', () => {
        const html = pure.renderResultPage('승인 완료 ✅', '<script>alert(1)</script> 팀의 인증이 승인되었습니다.');
        assert.ok(!html.includes('<script>alert(1)</script>'), '스크립트가 그대로 삽입되면 안 됨');
        assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
        assert.ok(html.includes('<h1>승인 완료 ✅</h1>')); // 정상 텍스트는 보존
    });
});

describe('extractRequestId (챗봇 승인/거절 파싱)', () => {
    test('clientExtra.request_id 우선', () => {
        const r = pure.extractRequestId({
            action: { clientExtra: { request_id: 'req-extra' } },
            userRequest: { utterance: '인증승인 req-utter' },
        });
        assert.deepStrictEqual(r, { requestId: 'req-extra', source: 'clientExtra' });
    });
    test('extra 없으면 utterance 마지막 토큰', () => {
        const r = pure.extractRequestId({ userRequest: { utterance: '인증승인  abc123' } });
        assert.deepStrictEqual(r, { requestId: 'abc123', source: 'utterance' });
    });
    test('단일 토큰 utterance → 빈 id (명령어만 입력)', () => {
        assert.strictEqual(pure.extractRequestId({ userRequest: { utterance: '인증승인' } }).requestId, '');
    });
    test('빈/누락 body 안전', () => {
        assert.strictEqual(pure.extractRequestId({}).requestId, '');
        assert.strictEqual(pure.extractRequestId(undefined).requestId, '');
    });
});

describe('extractRejectInfo (거절확정 3중 폴백)', () => {
    test('1순위: clientExtra (reason 포함)', () => {
        const r = pure.extractRejectInfo({
            action: { clientExtra: { request_id: 'r1', club_name: '강남배구', reason: '사진 불분명' } },
        });
        assert.strictEqual(r.requestId, 'r1');
        assert.strictEqual(r.clubName, '강남배구');
        assert.strictEqual(r.reason, '사진 불분명');
        assert.strictEqual(r.source, 'clientExtra');
    });
    test('2순위: action.params + reason은 utterance', () => {
        const r = pure.extractRejectInfo({
            action: { params: { request_id: 'r2', club_name: '한강배구' } },
            userRequest: { utterance: '중복 신청' },
        });
        assert.strictEqual(r.requestId, 'r2');
        assert.strictEqual(r.clubName, '한강배구');
        assert.strictEqual(r.reason, '중복 신청');
        assert.strictEqual(r.source, 'fallback');
    });
    test('3순위: contexts의 reject_context', () => {
        const r = pure.extractRejectInfo({
            contexts: [
                { name: 'other', params: {} },
                { name: 'reject_context', params: { request_id: { value: 'r3' }, club_name: { value: '분당배구' } } },
            ],
        });
        assert.strictEqual(r.requestId, 'r3');
        assert.strictEqual(r.clubName, '분당배구');
    });
    test('모두 없으면 requestId null (핸들러가 재시작 안내)', () => {
        assert.strictEqual(pure.extractRejectInfo({}).requestId, null);
    });
});

describe('unauthorizedResponse', () => {
    test('카카오 2.0 포맷 + 관리자 전용 문구', () => {
        const r = pure.unauthorizedResponse();
        assert.strictEqual(r.version, '2.0');
        assert.match(r.template.outputs[0].simpleText.text, /권한이 없습니다/);
    });
});
