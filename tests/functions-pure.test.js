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

// 2026-09-08 KOE322 장애의 재발 방지선.
// 카카오 refresh token 은 60일 만료이고, 갱신 응답에 새 토큰이 실려오는 건
// 만료 1개월 미만일 때뿐이다. 예전 코드는 그 토큰을 로그로만 남기고 버려서
// 사람이 손으로 시크릿을 갈아끼우지 않으면 알림이 통째로 끊겼다.
// 이제 회전분을 Firestore 에 쌓고 시크릿은 seed 로만 쓰는데, "저장분과 seed 중
// 무엇을 쓰나"를 틀리면 같은 장애가 조용히 반복된다. 그 판단만 여기서 고정한다.
describe('chooseRefreshToken', () => {
    const SEED = 'seed-refresh-token';
    const fp = pure.refreshTokenFingerprint(SEED);

    test('저장분이 없으면 시크릿 seed 를 쓴다 (배포 직후)', () => {
        const r = pure.chooseRefreshToken({}, SEED);
        assert.strictEqual(r.token, SEED);
        assert.strictEqual(r.usingStored, false);
        assert.strictEqual(r.seedFp, fp);
    });

    test('같은 seed 에서 회전된 저장분이 있으면 그걸 쓴다 (수동 교체 불필요)', () => {
        const r = pure.chooseRefreshToken(
            { refresh_token: 'rotated-1', refresh_token_seed_fp: fp }, SEED);
        assert.strictEqual(r.token, 'rotated-1');
        assert.strictEqual(r.usingStored, true);
    });

    // 이게 핵심이다. 운영자가 장애 복구로 시크릿을 새로 넣었는데 코드가 낡은
    // 저장분을 계속 쓰면, 사람이 고쳐도 안 고쳐지는 상태가 된다.
    test('시크릿이 교체되면 저장분을 버린다 — 수동 복구가 항상 이긴다', () => {
        const r = pure.chooseRefreshToken(
            { refresh_token: 'rotated-from-old-seed', refresh_token_seed_fp: fp },
            'brand-new-seed');
        assert.strictEqual(r.token, 'brand-new-seed');
        assert.strictEqual(r.usingStored, false);
    });

    test('지문 없는 레거시 저장분은 신뢰하지 않는다', () => {
        const r = pure.chooseRefreshToken({ refresh_token: 'no-fp' }, SEED);
        assert.strictEqual(r.token, SEED);
        assert.strictEqual(r.usingStored, false);
    });

    test('cached 가 null/undefined 여도 죽지 않는다', () => {
        assert.strictEqual(pure.chooseRefreshToken(null, SEED).token, SEED);
        assert.strictEqual(pure.chooseRefreshToken(undefined, SEED).token, SEED);
    });

    test('지문은 토큰 원문을 드러내지 않는다 (16자 hex)', () => {
        assert.match(fp, /^[0-9a-f]{16}$/);
        assert.notStrictEqual(fp, SEED);
        assert.notStrictEqual(fp, pure.refreshTokenFingerprint('other'));
    });
});

// 주소 지오코딩이 0건일 때 쓰는 장소(키워드) 검색 응답 파싱.
// 2026-09-09: '석관중' 으로 검색했더니 안 잡혀 지도에서 핀을 직접 찍어야 했다.
// 주소 전용 지오코더는 장소 이름을 모른다 — 그런데 이 폼의 주소칸에는 체육관·학교
// 이름이 들어오는 게 자연스럽다. 그 폴백의 파싱을 고정한다.
describe('pickKakaoPlace', () => {
    const doc = (o) => ({ documents: [o] });

    test('첫 결과의 좌표·도로명·장소명을 뽑는다', () => {
        const r = pure.pickKakaoPlace(doc({
            place_name: '석관중학교',
            road_address_name: '서울 성북구 한천로 526',
            address_name: '서울 성북구 석관동 356',
            x: '127.0573', y: '37.6099',
        }));
        assert.strictEqual(r.placeName, '석관중학교');
        assert.strictEqual(r.roadAddress, '서울 성북구 한천로 526');
        assert.ok(Math.abs(r.lat - 37.6099) < 1e-9);
        assert.ok(Math.abs(r.lng - 127.0573) < 1e-9);
    });

    test('도로명이 없으면 지번으로 대체한다', () => {
        const r = pure.pickKakaoPlace(doc({
            place_name: '어디체육관', road_address_name: '',
            address_name: '서울 성북구 석관동 356', x: '127', y: '37',
        }));
        assert.strictEqual(r.roadAddress, '서울 성북구 석관동 356');
    });

    test('결과 없음 / 빈 응답 / null 은 모두 null', () => {
        assert.strictEqual(pure.pickKakaoPlace({ documents: [] }), null);
        assert.strictEqual(pure.pickKakaoPlace({}), null);
        assert.strictEqual(pure.pickKakaoPlace(null), null);
    });

    // NaN 좌표가 그대로 저장되면 그 팀은 지도에서 사라진다. 0건보다 나쁘다.
    test('좌표가 숫자가 아니면 버린다', () => {
        assert.strictEqual(pure.pickKakaoPlace(doc({ x: '', y: '' })), null);
        assert.strictEqual(pure.pickKakaoPlace(doc({ x: 'abc', y: 'def' })), null);
        assert.strictEqual(pure.pickKakaoPlace(doc({ place_name: '좌표없음' })), null);
    });
});

// 팀 소유권 클레임 — 초기 51개 팀을 구글시트로 접수하며 받은 담당자 메일과
// 나중 가입자를 잇는다. 권한을 넘기는 판단이라 경계가 곧 보안선이다.
describe('normalizeEmail', () => {
    test('공백·대소문자만 정리한다', () => {
        assert.strictEqual(pure.normalizeEmail('  Paul.Yoo@GMail.com '), 'paul.yoo@gmail.com');
    });

    // 시트에는 '없음', '-', 빈칸이 섞여 들어온다. 그게 서로 매칭되면
    // 관계없는 두 팀이 한 사람에게 붙는다.
    test('메일 형식이 아니면 빈 문자열 — 쓰레기끼리 매칭되지 않게', () => {
        ['', '   ', '없음', '-', 'n/a', 'paulyoo999', '@gmail.com', 'a@b', null, undefined]
            .forEach((v) => assert.strictEqual(pure.normalizeEmail(v), '', JSON.stringify(v)));
    });

    // gmail 점·+별칭은 일부러 접지 않는다(주석 참고). 다르게 취급됨을 고정한다.
    test('gmail 점·+별칭은 접지 않는다 (의도)', () => {
        assert.notStrictEqual(
            pure.normalizeEmail('paul.yoo@gmail.com'),
            pure.normalizeEmail('paulyoo@gmail.com'));
        assert.notStrictEqual(
            pure.normalizeEmail('a+team@gmail.com'),
            pure.normalizeEmail('a@gmail.com'));
    });
});

describe('maskEmail', () => {
    test('앞 3자만 남긴다', () => {
        assert.strictEqual(pure.maskEmail('paulyoo999@gmail.com'), 'pau***@gmail.com');
    });
    test('짧은 아이디도 최소 1자는 가린다', () => {
        assert.strictEqual(pure.maskEmail('ab@x.com'), 'a***@x.com');
        assert.strictEqual(pure.maskEmail('a@x.com'), 'a***@x.com');
    });
    test('형식이 아니면 빈 문자열', () => {
        assert.strictEqual(pure.maskEmail('없음'), '');
    });
    // 카톡·로그에 주소 전문이 남지 않아야 한다.
    test('원문 아이디가 통째로 드러나지 않는다', () => {
        const m = pure.maskEmail('paulyoo999@gmail.com');
        assert.ok(m.indexOf('paulyoo999') === -1, m);
    });
});

describe('claimBlockReason', () => {
    test('주인 없는 팀은 넘길 수 있다', () => {
        assert.strictEqual(pure.claimBlockReason({ name: 'A' }), null);
        assert.strictEqual(pure.claimBlockReason({ name: 'A', registered_by: null }), null);
        assert.strictEqual(pure.claimBlockReason({ name: 'A', registered_by: '' }), null);
    });

    // 시트의 메일이 낡았거나 담당자가 바뀌었을 수 있다. 메일이 맞다는 이유로
    // 이미 주인이 있는 팀을 빼앗으면 안 된다.
    test('이미 주인이 있으면 막는다', () => {
        assert.strictEqual(pure.claimBlockReason({ registered_by: 'uid-1' }), 'already_owned');
    });

    test('없는 팀', () => {
        assert.strictEqual(pure.claimBlockReason(null), 'not_found');
        assert.strictEqual(pure.claimBlockReason(undefined), 'not_found');
    });
});
