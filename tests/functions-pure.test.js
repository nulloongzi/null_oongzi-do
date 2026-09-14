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

describe('deepLinkUrl / kakaoLink (카톡 "자세히 보기" 착지)', () => {
    test('club 은 ?club=, 픽업은 ?spot= 으로 나간다', () => {
        assert.strictEqual(pure.deepLinkUrl('club', 'abc123'),
            'https://do.nulloongzi.com/?club=abc123');
        assert.strictEqual(pure.deepLinkUrl('pickup', 'spot-9'),
            'https://do.nulloongzi.com/?spot=spot-9');
    });

    // reports.kind 는 'pickup' 인데 착지 쿼리는 'spot' 이다. 이 어긋남이
    // 이 헬퍼를 만든 이유이므로 양쪽 표기를 모두 고정해 둔다.
    test("'spot' 도 'pickup' 과 같은 링크를 만든다", () => {
        assert.strictEqual(pure.deepLinkUrl('spot', 'x'), pure.deepLinkUrl('pickup', 'x'));
    });

    test('대상이 없으면 빈 쿼리 대신 첫 화면으로', () => {
        // 빈 ?club= 를 달면 착지 쪽(js/app.js)이 없는 팀을 찾느라 헛돈다.
        [undefined, null, '', '   '].forEach((id) => {
            assert.strictEqual(pure.deepLinkUrl('club', id), pure.SITE_ORIGIN);
        });
    });

    test('모르는 kind 는 첫 화면으로', () => {
        assert.strictEqual(pure.deepLinkUrl('team', 'abc'), pure.SITE_ORIGIN);
        assert.strictEqual(pure.deepLinkUrl(undefined, 'abc'), pure.SITE_ORIGIN);
    });

    test('id 는 URI 인코딩된다', () => {
        assert.strictEqual(pure.deepLinkUrl('club', 'a b&c=d'),
            'https://do.nulloongzi.com/?club=a%20b%26c%3Dd');
    });

    test('앞뒤 공백은 떼고 붙인다', () => {
        assert.strictEqual(pure.deepLinkUrl('club', '  abc  '),
            'https://do.nulloongzi.com/?club=abc');
    });

    test('kakaoLink 는 web/mobile 두 벌을 같은 값으로 준다', () => {
        const link = pure.kakaoLink('club', 'abc');
        assert.deepStrictEqual(Object.keys(link).sort(), ['mobile_web_url', 'web_url']);
        assert.strictEqual(link.web_url, link.mobile_web_url);
        assert.strictEqual(link.web_url, 'https://do.nulloongzi.com/?club=abc');
    });
});

describe('clubAdminUids (팀 관리자 목록)', () => {
    test('admins 배열이 정본', () => {
        assert.deepStrictEqual(pure.clubAdminUids({ admins: ['a', 'b'] }), ['a', 'b']);
    });

    // admins 필드가 생기기 전 문서. 마이그레이션을 안 돌려도 기존 소유자가
    // 권한을 잃으면 안 된다 — 그 순간 그 사람은 자기 팀을 못 고친다.
    test('admins 가 없으면 registered_by 한 명을 관리자로 본다', () => {
        assert.deepStrictEqual(pure.clubAdminUids({ registered_by: 'owner' }), ['owner']);
    });

    test('admins 가 있으면 registered_by 를 덧붙이지 않는다', () => {
        // 등록자가 스스로 빠진 뒤 registered_by 만 남은 경우까지 되살리면 안 된다.
        assert.deepStrictEqual(pure.clubAdminUids({ admins: ['a'], registered_by: 'owner' }), ['a']);
    });

    test('중복·빈 값·공백을 정리한다', () => {
        assert.deepStrictEqual(pure.clubAdminUids({ admins: ['a', ' a ', '', null, 'b'] }), ['a', 'b']);
    });

    test('주인 없는 팀은 빈 목록', () => {
        assert.deepStrictEqual(pure.clubAdminUids({}), []);
        assert.deepStrictEqual(pure.clubAdminUids(null), []);
    });
});

describe('canManageClub', () => {
    test('목록에 있으면 true, 없으면 false', () => {
        assert.strictEqual(pure.canManageClub({ admins: ['a', 'b'] }, 'b'), true);
        assert.strictEqual(pure.canManageClub({ admins: ['a', 'b'] }, 'c'), false);
    });
    test('구 문서의 registered_by 도 통과', () => {
        assert.strictEqual(pure.canManageClub({ registered_by: 'owner' }, 'owner'), true);
    });
    test('uid 가 없으면 false — 비로그인이 통과하면 안 된다', () => {
        assert.strictEqual(pure.canManageClub({ admins: [''] }, ''), false);
        assert.strictEqual(pure.canManageClub({ admins: ['a'] }, null), false);
    });
});

describe('adminRequestBlockReason / addClubAdmin (정원 3명)', () => {
    test('빈 팀은 받는다', () => {
        assert.strictEqual(pure.adminRequestBlockReason({}, 'a'), null);
    });
    test('이미 관리자면 already_admin', () => {
        assert.strictEqual(pure.adminRequestBlockReason({ admins: ['a'] }, 'a'), 'already_admin');
    });
    test('3명이면 full', () => {
        assert.strictEqual(pure.adminRequestBlockReason({ admins: ['a', 'b', 'c'] }, 'd'), 'full');
    });
    test('2명까지는 받는다', () => {
        assert.strictEqual(pure.adminRequestBlockReason({ admins: ['a', 'b'] }, 'c'), null);
    });
    test('없는 팀은 not_found', () => {
        assert.strictEqual(pure.adminRequestBlockReason(null, 'a'), 'not_found');
    });

    test('addClubAdmin 은 뒤에 붙인다', () => {
        const r = pure.addClubAdmin({ admins: ['a'] }, 'b');
        assert.strictEqual(r.added, true);
        assert.deepStrictEqual(r.admins, ['a', 'b']);
    });

    // 신청이 접수된 뒤 정원이 찼을 수 있다. 승인 시점에 다시 보지 않으면
    // 4명째가 들어가고 정원이 무너진다.
    test('정원이 찼으면 넣지 않고 이유를 돌려준다', () => {
        const r = pure.addClubAdmin({ admins: ['a', 'b', 'c'] }, 'd');
        assert.strictEqual(r.added, false);
        assert.strictEqual(r.reason, 'full');
        assert.deepStrictEqual(r.admins, ['a', 'b', 'c']);
    });

    test('구 문서에 한 명을 더해도 registered_by 가 유지된다', () => {
        const r = pure.addClubAdmin({ registered_by: 'owner' }, 'b');
        assert.deepStrictEqual(r.admins, ['owner', 'b']);
    });
});

describe('removeClubAdmin (스스로 빠지기)', () => {
    test('본인만 빠지고 나머지는 그대로', () => {
        const r = pure.removeClubAdmin({ admins: ['a', 'b', 'c'] }, 'b');
        assert.strictEqual(r.removed, true);
        assert.deepStrictEqual(r.admins, ['a', 'c']);
    });

    // 마지막 한 명이 나가면 주인 없는 팀으로 돌아간다. 그래야 팀을 떠난
    // 사람이 권한을 쥔 채 남지 않고, 다음 사람이 신청할 수 있다.
    test('마지막 한 명도 빠질 수 있다', () => {
        const r = pure.removeClubAdmin({ admins: ['a'] }, 'a');
        assert.strictEqual(r.removed, true);
        assert.deepStrictEqual(r.admins, []);
    });

    test('관리자가 아니면 not_admin', () => {
        const r = pure.removeClubAdmin({ admins: ['a'] }, 'z');
        assert.strictEqual(r.removed, false);
        assert.strictEqual(r.reason, 'not_admin');
    });
});

describe('위치 공개 수준 — areaLabel (체육관 이름을 버리고 시군구만)', () => {
    // 진짜 위험한 건 좌표보다 **체육관 이름**이다. 이름 + 시간표가 같이 보이면
    // 대관에서 밀린 사람이 누가 쓰는지 특정할 수 있다(2026-09 실제 민원 사례).
    const CASES = [
        ['서울 성북구 화랑로13길 144', '서울 성북구'],
        ['경기도 성남시 분당구 양현로 262', '경기도 성남시 분당구'],
        ['세종특별자치시 다정남로 91', '세종특별자치시'],
        ['경남 창원시 마산회원구 팔용로 280', '경남 창원시 마산회원구'],
        ['부산 북구 덕천2길 10', '부산 북구'],
        ['경기 광명시 가림로 18 하안북초등학교', '경기 광명시']
    ];
    CASES.forEach(([input, want]) => {
        test(JSON.stringify(input), () => {
            assert.strictEqual(pure.areaLabel(input), want);
        });
    });

    // 실제 접수 표기는 "체육관 이름 + (주소)" 가 흔하다. 앞에서부터 자르면
    // '구리 여자중학교' 의 '구리' 가 라벨이 되어 엉뚱해진다.
    test('장소 이름이 앞에 오면 괄호 안 주소를 찾아낸다', () => {
        assert.strictEqual(
            pure.areaLabel('구리 여자중학교 체육관(경기도 구리시 벌말로 168)'),
            '경기도 구리시');
    });

    // 주소가 아예 없는 입력도 흔하다. 억지로 만들지 않고 빈 값을 돌려주면
    // 호출부가 좌표를 역지오코딩해 라벨을 만든다.
    test('행정구역이 없으면 빈 문자열 — 억지로 만들지 않는다', () => {
        assert.strictEqual(pure.areaLabel('하남종합운동장국민체육센터'), '');
        assert.strictEqual(pure.areaLabel('오산 죽미 다목적 체육관'), '');
        assert.strictEqual(pure.areaLabel(''), '');
        assert.strictEqual(pure.areaLabel(null), '');
    });

    test('라벨에 번지·건물명이 절대 남지 않는다', () => {
        CASES.concat([['구리 여자중학교 체육관(경기도 구리시 벌말로 168)', '']])
            .forEach(([input]) => {
                const label = pure.areaLabel(input);
                if (!label) return;
                assert.ok(!/\d/.test(label), '숫자가 남았다: ' + label);
                assert.ok(!/(초등학교|중학교|고등학교|체육관|센터)/.test(label),
                    '시설 이름이 남았다: ' + label);
            });
    });
});

describe('위치 공개 수준 — 격자 반올림', () => {
    test('0.005° 격자에 맞춘다', () => {
        assert.strictEqual(pure.roundToAreaGrid(37.6051234), 37.605);
        assert.strictEqual(pure.roundToAreaGrid(127.0573), 127.055);
    });

    // 규칙(firestore.rules)이 같은 식으로 검증한다. 반올림 결과를 다시 넣어도
    // 값이 그대로여야 통과한다 — 부동소수 때문에 어긋나면 저장이 거부된다.
    test('반올림 결과는 멱등이고 정렬로 판정된다', () => {
        [37.6051234, 127.0573, 35.1, 129.99999, 33.0, 38.5].forEach((v) => {
            const r = pure.roundToAreaGrid(v);
            assert.strictEqual(pure.roundToAreaGrid(r), r, '멱등 아님: ' + v);
            assert.strictEqual(pure.isAreaGridAligned(r), true, '정렬 판정 실패: ' + v);
        });
    });

    test('격자에서 벗어난 값은 정렬이 아니다', () => {
        assert.strictEqual(pure.isAreaGridAligned(37.6051234), false);
    });

    test('숫자가 아니면 null / false', () => {
        assert.strictEqual(pure.roundToAreaGrid('abc'), null);
        assert.strictEqual(pure.isAreaGridAligned(NaN), false);
        assert.strictEqual(pure.isAreaGridAligned(undefined), false);
    });
});

describe('위치 공개 수준 — 기본값', () => {
    // 필드가 없는 기존 문서를 조용히 뭉개면, 팀은 모르는 사이에 자기 팀이
    // 지도에서 옮겨진 것처럼 보인다. 기본은 지금까지와 같은 '정확히'.
    test('필드가 없으면 exact', () => {
        assert.strictEqual(pure.locationPrecision({}), 'exact');
        assert.strictEqual(pure.locationPrecision(null), 'exact');
        assert.strictEqual(pure.isAreaOnly({}), false);
    });
    test("'area' 만 area 로 친다", () => {
        assert.strictEqual(pure.isAreaOnly({ location_precision: 'area' }), true);
        assert.strictEqual(pure.isAreaOnly({ location_precision: 'AREA' }), false);
        assert.strictEqual(pure.isAreaOnly({ location_precision: 'rough' }), false);
    });
});
