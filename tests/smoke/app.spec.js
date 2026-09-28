// tests/smoke/app.spec.js — 헤드리스 스모크: "한 바퀴 싹 돌리기" (방법론 웹 티어 3).
//
// 검증 정책:
//  · 페이지 에러(uncaught) 0 — 단, 외부 SDK(kakao/firebase CDN) 가용성에 좌우되는
//    에러는 허용목록으로 제외해 결정성 확보. 우리 코드의 오타/미정의 참조 회귀는 잡힘.
//  · 패리티 DOM: 검색(#fsKeyword)·필터시트·탭·언어토글 등 핵심 UI 존재.
//  · 인터랙션: 필터시트 열기, KO↔EN 토글이 실제 DOM 텍스트를 바꾸는지.
'use strict';
/* global window, document, Image -- addInitScript·page.evaluate 콜백은 브라우저 컨텍스트에서 실행됨 */

const { test, expect } = require('@playwright/test');

// 외부 SDK 부재/차단에서 비롯되는 에러만 허용 (우리 코드 회귀는 통과 불가)
const EXTERNAL_ERROR = /kakao|firebase|gstatic|html2canvas|qrcode|Failed to fetch|NetworkError|ERR_/i;

function collectPageErrors(page, sink) {
    page.on('pageerror', (err) => {
        if (!EXTERNAL_ERROR.test(String(err && err.message))) sink.push(err);
    });
}

test('로드: 타이틀 + 앱 자체 페이지 에러 0', async ({ page }) => {
    const errors = [];
    collectPageErrors(page, errors);
    await page.goto('/');
    // i18n이 로케일에 따라 타이틀을 KO/EN으로 바꿈 → 언어 무관 부분으로 검증
    await expect(page).toHaveTitle(/Nulloongzi-do/i);
    await page.waitForTimeout(1500); // 지연 초기화 에러 수집 여유
    expect(errors, errors.map(String).join('\n')).toEqual([]);
});

test('패리티 DOM: 핵심 UI 요소 존재', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeAttached();
    await expect(page.locator('#fsKeyword')).toBeAttached(); // 필터시트 검색 인풋(패리티 항목)
    await expect(page.locator('#filterSheet')).toBeAttached();
    await expect(page.locator('#tabClubs')).toBeVisible();
    await expect(page.locator('#tabPickup')).toBeVisible();
    await expect(page.locator('#langToggle')).toBeVisible();
    await expect(page.locator('#filterBtnIcon')).toBeVisible();
});

test('인터랙션: 필터 시트 열기', async ({ page }) => {
    await page.goto('/');
    await page.locator('#filterBtnIcon').click();
    // openFilterSheet()가 시트를 표시 상태로 전환해야 함
    await expect(page.locator('#filterSheet')).toHaveClass(/open|show|active/, { timeout: 3000 })
        .catch(async () => {
            // 클래스 컨벤션이 다르면 가시성으로 폴백 판정
            await expect(page.locator('#filterSheet')).toBeVisible();
        });
    await expect(page.locator('#fsKeyword')).toBeVisible();
});

// 카카오/네이버는 리다이렉트 로그인 → 복귀 후 토큰 교환 구간이 비어 보이면 안 된다.
// 외부 SDK를 차단해 결정적으로 만들고, 토큰 교환은 끝나지 않는 Promise로 흉내낸다.
async function stubSlowTokenExchange(page) {
    await page.route('**', (route) => {
        const url = route.request().url();
        return url.startsWith('http://localhost:4173') ? route.continue() : route.abort();
    });
    await page.addInitScript(() => {
        window.firebaseCallable = function () {
            return function () { return new Promise(function () {}); };
        };
    });
}

test('소셜 로그인 복귀(?code=&state=): 로그인 중 안내가 뜬다', async ({ page }) => {
    await stubSlowTokenExchange(page);
    await page.goto('/?code=dummy&state=kakao_dummy');
    await expect(page.locator('#authLoadingOverlay')).toBeVisible();
    await expect(page.locator('#authLoadingTitle')).not.toBeEmpty();
    // 제공자별 반투명 효과 테마가 state 접두사로 결정되는지
    await expect(page.locator('html')).toHaveClass(/auth-theme-kakao/);
});

test('일반 방문에는 로그인 안내가 뜨지 않는다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#authLoadingOverlay')).toBeHidden();
});

test('소셜 로그인 취소(?error=): 안내를 내리고 URL을 정리한다', async ({ page }) => {
    await stubSlowTokenExchange(page);
    await page.goto('/?error=access_denied&state=naver_dummy');
    await expect(page.locator('#authLoadingOverlay')).toBeHidden();
    await expect.poll(() => page.url()).not.toContain('error=');
});

test('인터랙션: KO↔EN 언어 토글이 DOM 텍스트를 바꿈', async ({ page }) => {
    await page.goto('/');
    const tab = page.locator('#tabClubs');
    const before = (await tab.textContent()).trim();
    await page.locator('#langToggle').click();
    await expect(tab).not.toHaveText(before, { timeout: 3000 });
    // 원복 (localStorage 저장 동작 확인 겸)
    await page.locator('#langToggle').click();
    await expect(tab).toHaveText(before, { timeout: 3000 });
});

// 픽업 탭 크롬 스왑 — 목록이 하단 46vh를 차지하므로 그 위에 뜨던 FAB을 정리한다.
// 도시락(🍱)·네임카드(🍚)는 로그인 기능이고 픽업은 무로그인 발견 wedge라 숨긴다.
// 등록 FAB은 동호회(팀등록) ↔ 픽업(픽업등록) 으로 같은 자리를 물려받는다.
test('픽업 탭: 로그인 전용 FAB 숨김 + 등록 FAB 스왑', async ({ page }) => {
    await page.goto('/');

    // 동호회(기본) 상태
    await expect(page.locator('#fabLunchbox')).toBeVisible();
    await expect(page.locator('#fabProfile')).toBeVisible();
    await expect(page.locator('#fabClubRegister')).toBeVisible();
    await expect(page.locator('#fabPickupCreate')).toBeHidden();

    await page.locator('#tabPickup').click();

    // 픽업 상태: 로그인 FAB 사라지고 등록 FAB이 바뀐다
    await expect(page.locator('#fabLunchbox')).toBeHidden();
    await expect(page.locator('#fabProfile')).toBeHidden();
    await expect(page.locator('#fabClubRegister')).toBeHidden();
    await expect(page.locator('#fabPickupCreate')).toBeVisible();
    // 지도 조작인 내 위치는 남고, 목록 패널이 뜬다
    await expect(page.locator('#pickupListPanel')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/pickup-mode/);

    // 동호회로 돌아오면 원상복구 (스왑이 단방향이면 여기서 깨진다)
    await page.locator('#tabClubs').click();
    await expect(page.locator('#fabLunchbox')).toBeVisible();
    await expect(page.locator('#fabProfile')).toBeVisible();
    await expect(page.locator('#fabClubRegister')).toBeVisible();
    await expect(page.locator('#fabPickupCreate')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/pickup-mode/);
});

// 헤더 과밀 회귀 방지: 필터 3종은 한 줄(.pl-filters), 등록 버튼은 헤더에 없어야 한다.
test('픽업 목록 헤더: 필터 한 줄 + 등록 버튼은 헤더 밖', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabPickup').click();

    const filters = page.locator('.pl-filters');
    await expect(filters).toBeVisible();
    await expect(filters.locator('#pkRegionFilter')).toBeVisible();
    await expect(filters.locator('#pkLevelFilter')).toBeVisible();
    await expect(filters.locator('#pkEnFilter')).toBeVisible();

    // 등록은 FAB으로 빠졌으므로 헤더 안에 버튼이 남아 있으면 안 된다
    await expect(page.locator('.pl-header .pl-host-btn')).toHaveCount(0);
});

// 상세는 별도 시트가 아니라 목록 패널의 모드(.detail)여야 한다 — 크기·모서리가 다른
// 두 장(목록 46vh + 상세 시트 82vh)이 겹쳐 보이던 회귀 방지.
test('픽업 상세: 목록 패널이 그대로 정보창이 된다 (별도 시트 없음)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabPickup').click();
    const panel = page.locator('#pickupListPanel');
    await expect(panel).toBeVisible();
    await expect(page.locator('#pickupSheet')).toHaveCount(0); // 옛 상세 시트는 없어야 한다

    // 네트워크 데이터에 기대지 않도록 메모리 캐시에 가짜 스팟을 넣고 바로 연다
    await page.evaluate(() => {
        window.pickupGames.push({
            id: 'smoke-spot', title: '스모크 크루', sport: '6s', level: 'any',
            region: '서울', address: '서울 광진구', insta: 'smoke_crew'
        });
        window.openPickupDetail('smoke-spot');
    });

    // 상세 모드: 같은 패널이 커지고 목록 헤더 대신 뒤로가기 + 상세 내용
    await expect(panel).toHaveClass(/detail/);
    await expect(page.locator('body')).toHaveClass(/pickup-detail/);
    await expect(page.locator('#plBackBtn')).toBeVisible();
    await expect(page.locator('#pickupSheetContent .ps-title')).toHaveText('스모크 크루');
    await expect(panel.locator('.pl-header')).toBeHidden();
    await expect(page.locator('.fab-group')).toBeHidden(); // 72vh 위로 못 올리므로 숨김

    // 뒤로가기: 목록 모드 복귀
    await page.locator('#plBackBtn').click();
    await expect(panel).not.toHaveClass(/detail/);
    await expect(panel.locator('.pl-header')).toBeVisible();
    await expect(page.locator('#pickupSheetContent')).toBeHidden();
    await expect(page.locator('.fab-group')).toBeVisible();
});

// guidelines.html 이 '7일 내 확인'과 '6개월 점검'을 약속했는데 화면에 창구·표시가 없으면
// 문서만 있는 약속이 된다. 상세에 신고 링크와 최종 확인일이 실제로 뜨는지 지킨다.
test('데이터 신뢰도: 상세에 최종 확인일 + 신고 버튼', async ({ page }) => {
    await page.goto('/');

    // 정책 4종이 필터 시트에서 도달 가능한지 (그전엔 직접 URL로만 열렸다)
    await page.locator('#filterBtnIcon').click();
    const policy = page.locator('.fs-policy');
    await expect(policy).toBeVisible();
    await expect(policy.locator('a[href="terms.html"]')).toBeVisible();
    await expect(policy.locator('a[href="guidelines.html"]')).toBeVisible();
    await expect(policy.locator('a[href="privacy.html"]')).toBeVisible();

    // 상세 신뢰도 블록: 오래된 항목이면 '확인 필요'가 함께 뜬다
    const trust = await page.evaluate(() => {
        const host = document.getElementById('clubDataTrust');
        const old = new Date();
        old.setFullYear(old.getFullYear() - 2);
        window.renderDataTrust(host, {
            id: 'smoke-club', name: '스모크 클럽',
            metadata: { updated_at: old }
        }, 'club');
        return {
            line: host.querySelector('.dt-line').textContent,
            stale: !!host.querySelector('.dt-line.dt-stale'),
            // 링크가 아니라 버튼이어야 한다 — 메일앱으로 이탈하지 않고 인앱 접수
            isButton: host.querySelector('.dt-report').tagName
        };
    });
    expect(trust.stale).toBe(true);      // 2년 전 = 6개월 기준 초과
    expect(trust.isButton).toBe('BUTTON');
    // 문구는 KO/EN 로케일에 따라 달라지므로 언어 무관한 부분으로 검증한다
    expect(trust.line).toContain('⚠️');
    expect(trust.line).toMatch(/\d{4}\.\d{1,2}\.\d{1,2}/);
});

// 신고는 mailto가 아니라 인앱 모달이어야 한다(모바일 메일앱 전환 = 이탈).
// 사유 없이 제출하면 막히는지까지 — 사유 enum 은 firestore.rules 가 강제하므로
// 클라이언트가 빈 값을 올려보내면 규칙에서 조용히 거부된다.
test('신고: 인앱 모달이 열리고 사유 없이 보내면 막는다', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
        window.renderDataTrust(
            document.getElementById('clubDataTrust'),
            { id: 'smoke-club', name: '스모크 클럽', metadata: { updated_at: new Date() } },
            'club'
        );
        document.querySelector('#clubDataTrust .dt-report').click();
    });

    const overlay = page.locator('#reportModalOverlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#reportTarget')).toHaveText('스모크 클럽'); // 대상이 프리필돼야 확인이 빠르다

    // 사유 미선택 제출 → 에러 안내, 모달 유지
    await page.locator('#reportSubmitBtn').click();
    await expect(page.locator('#reportError')).toBeVisible();
    await expect(overlay).toBeVisible();

    // 사유 선택하면 에러가 사라진다
    await page.locator('#reportReasonChips .rp-reason-chip[data-val="wrong_info"]').click();
    await expect(page.locator('#reportError')).toBeHidden();

    await page.locator('.report-modal .reg-modal-close').click();
    await expect(overlay).toBeHidden();
});

// 포장하기 — html2canvas(DOM 복제 + transform:scale) 경로를 canvas 직접 렌더로 갈아탔다.
// 회귀 지점 셋: 규격이 정확한가, 화면과 같은 도시락 그리드를 쓰는가,
// 빈 칸에 입력 유도 문구("담아주세요")가 새어 나가지 않는가.
test('포장하기: 두 규격이 정확한 크기로 렌더된다', async ({ page }) => {
    await page.goto('/');

    const out = await page.evaluate(async () => {
        window.currentProfileData = {
            full_nickname: '현미밥-a3z', nickname: '현미밥',
            created_at: new Date('2026-01-19'),
            bookmarks: ['t0', null, 't2', null, null]
        };
        const clubs = {
            t0: { id: 't0', name: 'GVT 배구클럽', schedule: '화 19:00-21:00' },
            t2: { id: 't2', name: '월요 리시브반', schedule: '월 20:00-22:00' }
        };
        window.findClub = (id) => clubs[id] || null;

        const d = window.buildMyCardData();
        const sizeOf = (url) => new Promise((res) => {
            const i = new Image();
            i.onload = () => res([i.naturalWidth, i.naturalHeight]);
            i.src = url;
        });
        const story = await sizeOf(await window.renderMyCard(d, false));
        const feed = await sizeOf(await window.renderMyCard(d, true));
        return { story, feed, slots: d.slots, events: d.events.length, bg: d.bgColor };
    });

    expect(out.story).toEqual([1080, 1920]);            // 9:16
    expect(out.feed).toEqual([1080, 1440]);             // 3:4 — 인스타 피드·그리드(2025~)
    // 슬롯 순서는 화면 UI와 같다: 0=밥 1=국 2~4=반찬
    expect(out.slots[0]).toBe('GVT 배구클럽');
    expect(out.slots[2]).toBe('월요 리시브반');
    expect(out.slots[1]).toBeNull();
    expect(out.events).toBe(2);                          // 두 팀의 일정이 잡힌다
    expect(out.bg).toBe('#FFF9C4');                      // 화면 네임카드와 같은 밥 색
});

test('포장하기: 빈 칸 라벨에 입력 유도 문구가 없다', async ({ page }) => {
    await page.goto('/');
    const labels = await page.evaluate(() =>
        ['mc_rice', 'mc_soup', 'mc_side1', 'mc_side2', 'mc_side3'].map((k) => window.t(k))
    );
    // 화면 UI 의 "밥을 담아주세요🍚" 같은 명령형은 공유물에 나가면 안 된다.
    for (const l of labels) {
        expect(l).not.toContain('담아');
        expect(l).not.toMatch(/Add /);
    }
    // 도시락통다움을 주는 키워드·이모지는 남아 있어야 한다
    expect(labels.join(' ')).toMatch(/🍚/);
    expect(labels.join(' ')).toMatch(/🥘/);
});

// html2canvas 를 완전히 걷어냈다. 다시 스며들면 DOM 복제 경로가 부활한 것이다.
test('포장하기: html2canvas 의존이 없다', async ({ page }) => {
    await page.goto('/');
    const has = await page.evaluate(() => typeof window.html2canvas !== 'undefined');
    expect(has).toBe(false);
});

// 밥친구(1단계): 🍚 팝업 두 장 + 도트 + 버블 배지. Firebase 없이 상태를 직접 넣어 화면 배선만 본다.
test('밥친구: 로그인 전엔 한 장, 로그인하면 두 장 + 받은 신청 신호', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.toggleProfileCard());
    // 도트가 숨은(로그아웃) 팝업도 세로 가운데 — auto 마진 가운데 정렬 회귀
    {
        const box = await page.locator('#pcPager').boundingBox();
        const vh = page.viewportSize().height;
        expect(Math.abs(box.y + box.height / 2 - vh / 2)).toBeLessThan(60);
    }
    await expect(page.locator('#pcDots')).toBeHidden();
    await expect(page.locator('#friendsCard')).toBeHidden();
    await page.evaluate(() => window.toggleProfileCard());

    await page.evaluate(() => {
        const s = window.friendState;
        s.uid = 'me'; s.loaded = true;
        s.profiles = { b: { name: '보리밥-k2', color: '#FFF59D' }, c: { name: '팥밥-q7', color: '#F8BBD0' } };
        s.incoming = [{ id: 'b_me', other: 'b', doc: { status: 'pending' } }];
        s.friends = [{ id: 'c_me', other: 'c', doc: { status: 'accepted' } }];
        window.localStorage.removeItem('nurungji_seen_friend_req');
        window.renderFriendsPage();
        window.toggleProfileCard();
    });

    // 버블 배지 = 받은 신청 수
    await expect(page.locator('#fabProfile .fab-badge')).toHaveText('1');
    // 도트 두 개, 첫 장이 켜짐, 둘째 점은 새 소식으로 빛남
    const dots = page.locator('#pcDots .pc-dot');
    await expect(page.locator('#pcDots')).toBeVisible();
    await expect(dots.nth(0)).toHaveClass(/on/);
    await expect(dots.nth(1)).toHaveClass(/sig/);

    // 둘째 장으로 넘기면 신청·친구가 보이고 신호는 꺼진다
    await dots.nth(1).click();
    await expect(page.locator('#friendsCard .fr-req')).toContainText('보리밥-k2');
    await expect(page.locator('#friendsCard .fr-row')).toContainText('팥밥-q7');
    await expect(dots.nth(1)).toHaveClass(/on/);
    await expect(dots.nth(1)).not.toHaveClass(/sig/);

    // 추가 화면: 형식 밖 코드는 바로 안내
    await page.locator('#friendsCard .fr-add-top').click();
    await page.locator('#frCodeInput').fill('abc');
    await page.locator('#friendsCard .fr-form button[type="submit"]').click();
    await expect(page.locator('#frLookupResult')).toContainText(/6자리|6 letters/);

    // 다시 열면 첫 장부터
    await page.evaluate(() => { window.toggleProfileCard(); window.toggleProfileCard(); });
    await expect(dots.nth(0)).toHaveClass(/on/);
});

// 공유 카드: 실제 폰트로 측정해도(단위 테스트는 mock 측정) 아주 긴 내용이 QR 스텁을 덮지 않는다.
// 칩이 줄 예산 밖에 있어서 태그가 많으면 넘치던 적이 있다 — 앱 테스트가 먼저 잡았다.
test('공유 카드: 긴 내용도 QR 스텁을 덮지 않는다 (두 규격, 실측)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async () => {
        await document.fonts.ready;
        const long = {
            title: '가'.repeat(120), url: 'https://do.nulloongzi.com/?spot=x',
            tags: Array.from({ length: 12 }, (_, i) => ({ t: '태그' + i + ' 가나다라마바사' })),
            thisWeek: '나'.repeat(300), schedule: '다'.repeat(300), fee: '라'.repeat(300),
            venue: '마'.repeat(100), address: '서울 송파구 ' + '바'.repeat(200)
        };
        return ['story', 'feed'].map((f) => {
            const L = window.spotCardLayout(long, f);
            return { f, cardBottom: L.card.y + L.card.h, limit: L.stubTop - window.SHARE_CARD.GAP };
        });
    });
    for (const r of out) expect(r.cardBottom, r.f).toBeLessThanOrEqual(r.limit + 0.01);
});

// 포장하기: confirm() 대신 미리보기 위 형태 칩(앱 share_image_screen 과 같은 두 칸).
// 기본 피드형(3:4) → 스토리형 칩을 누르면 그 자리에서 9:16 으로 다시 그린다.
test('포장하기: 형태 칩으로 피드(3:4) ↔ 스토리(9:16)를 바꾼다', async ({ page }) => {
    await page.goto('/');
    let dialogs = 0;
    page.on('dialog', (d) => { dialogs++; d.dismiss(); });
    await page.evaluate(() => {
        window.currentProfileData = { full_nickname: '현미밥-a3z', nickname: '현미밥', bookmarks: [null, null, null, null, null] };
        window.findClub = () => null;
        window.showShareOptions();
    });
    const shape = page.locator('#previewShape');
    await expect(shape).toBeVisible();
    await expect(shape.locator('[data-shape="feed"]')).toHaveClass(/selected/);
    const size = () => page.evaluate(() => new Promise((res) => {
        const i = document.querySelector('#previewImgBox img');
        const done = () => res([i.naturalWidth, i.naturalHeight]);
        if (i.complete && i.naturalWidth) done(); else i.onload = done;
    }));
    await expect(page.locator('#previewImgBox img')).toHaveCount(1);
    expect(await size()).toEqual([1080, 1440]);

    await shape.locator('[data-shape="story"]').click();
    await expect(shape.locator('[data-shape="story"]')).toHaveClass(/selected/);
    await expect(shape.locator('[data-shape="feed"]')).not.toHaveClass(/selected/);
    await expect.poll(size).toEqual([1080, 1920]);
    expect(dialogs).toBe(0);                            // confirm 창이 뜨지 않는다

    // 닫으면 칩도 숨는다 — 팀·픽업 카드 미리보기에는 형태 선택이 없다
    await page.evaluate(() => window.closePreview());
    await expect(shape).toBeHidden();
});

// 밥친구 2단계: 첫 친구 때 '보일 팀' 확인 → 친구 상세에서 식단표 겹쳐 보기 → 도시락 눈 스위치.
// Firebase 없이 상태·친구 사본을 직접 넣어 화면 배선만 본다(숨긴 팀이 사본에 안 들어가는 건 단위 테스트).
test('밥친구 2단계: 보일 팀 확인 · 겹쳐 보기 · 눈 스위치', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        window.currentProfileData = {
            full_nickname: '현미밥-a3k', nickname: '현미밥', created_at: new Date('2026-07-01'),
            bookmarks: ['t1', 'custom_1', null, null, null],
            customTeams: { custom_1: { id: 'custom_1', name: '회사팀', schedule: '수 19:00-21:00', isCustom: true } }
        };
        const clubs = { t1: { id: 't1', name: '잠실 배구회', schedule: '토 19:00-22:00' }, t2: { id: 't2', name: '송파 토요 픽업', schedule: '토 14:00-17:00' } };
        const orig = window.findClub;
        window.findClub = (id) => clubs[id] || (window.currentProfileData.customTeams[id]) || (orig && orig(id));
        window.confirmFriendShare = (hidden) => { window._confirmed = hidden; window.currentProfileData.friend_share_ok = true; window.currentProfileData.friend_hidden = hidden; return Promise.resolve(); };
        window.setFriendHidden = (id, h) => { window._hid = [id, h]; return Promise.resolve(); };
        window.loadFriendLunchbox = () => Promise.resolve({ status: 'ok', updatedMs: 1, teams: [{ id: 't2', name: '송파 토요 픽업', schedule: '토 14:00-17:00', slot: 0 }] });
        const s = window.friendState;
        s.uid = 'me'; s.loaded = true;
        s.profiles = { c: { name: '팥밥-q7', color: '#F8BBD0' } };
        s.friends = [{ id: 'c_me', other: 'c', doc: { status: 'accepted' } }];
        window.updateProfileUI(true);
        window.renderFriendsPage();
        window.toggleProfileCard();
    });
    await page.locator('#pcDots .pc-dot').nth(1).click();

    // 확인 카드: 도시락 팀이 체크된 채로. 회사팀을 끄고 확인 → 숨긴 목록으로 넘어간다
    const confirm = page.locator('#friendsCard .fr-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('input[type=checkbox]')).toHaveCount(2);
    await confirm.locator('label', { hasText: '회사팀' }).locator('input').uncheck();
    await confirm.locator('button').click();
    await expect.poll(() => page.evaluate(() => window._confirmed)).toEqual(['custom_1']);
    await expect(page.locator('#friendsCard .fr-confirm')).toHaveCount(0);
    await expect(page.locator('#friendsCard .fr-vis')).toBeVisible();

    // 친구 상세: 친구 도시락 칩 + 겹쳐 보기(친구 칸 채움 · 내 칸 점선)
    await page.locator('#friendsCard .fr-row', { hasText: '팥밥-q7' }).click();
    await expect(page.locator('#friendsCard .fr-chip')).toContainText('송파 토요 픽업');
    await expect(page.locator('#friendsCard .fr-tt-blk.fr')).toHaveCount(1);
    await expect(page.locator('#friendsCard .fr-tt-blk.me')).toHaveCount(2);   // 토 잠실 + 수 회사팀

    // 도시락 편집: 채운 칸마다 눈 스위치
    await page.evaluate(() => { window.toggleProfileCard(); window.openLunchbox(); window.toggleEditMode(); });
    const eyes = page.locator('#lunchboxGrid .lb-eye');
    await expect(eyes).toHaveCount(2);
    await eyes.first().click();
    await expect.poll(() => page.evaluate(() => window._hid)).toEqual(['t1', true]);
});

test('밥친구 3단계: 합석 줄 · 합석 단계 · 🍚 버블', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        window.currentProfileData = {
            full_nickname: '현미밥-a3k', nickname: '현미밥', created_at: new Date('2026-07-01'),
            bookmarks: ['t1', 't3', 't4', null, null], customTeams: {},
            friend_share_ok: true, friend_hidden: ['t4']
        };
        const clubs = {
            t1: { id: 't1', name: '잠실 배구회', schedule: '토 19:00-22:00' },
            t3: { id: 't3', name: '강동 화요반', schedule: '화 20:00-22:00' },
            t4: { id: 't4', name: '숨긴 팀', schedule: '목 20:00-22:00' },
            t5: { id: 't5', name: '다른 팀', schedule: '토 19:00-22:00' }
        };
        const orig = window.findClub;
        window.findClub = (id) => clubs[id] || (orig && orig(id));
        const lb = {
            c: { status: 'ok', updatedMs: 1, teams: ['t1', 't3', 't4'].map((id, i) => ({ id, name: clubs[id].name, schedule: clubs[id].schedule, slot: i })) },
            d: { status: 'ok', updatedMs: 1, teams: [{ id: 't5', name: '다른 팀', schedule: clubs.t5.schedule, slot: 0 }] }
        };
        window.peekFriendLunchbox = (o) => lb[o];
        window.loadFriendLunchbox = (o) => Promise.resolve(lb[o]);
        const s = window.friendState;
        s.uid = 'me'; s.loaded = true;
        s.profiles = { c: { name: '팥밥-q7', color: '#F8BBD0' }, d: { name: '흑미밥-z9', color: '#FFF176' } };
        s.friends = [
            { id: 'd_me', other: 'd', doc: { status: 'accepted' } },
            { id: 'c_me', other: 'c', doc: { status: 'accepted' } }
        ];
        window.updateProfileUI(true);
        window.renderFriendsPage();
    });

    // 🍚 버블: 처음 합석하게 된 친구(같은 팀 2개 → 한 그릇)가 있으면 단계 색 테두리 + 둘째 도트 신호.
    // 숨긴 목요일 팀은 세지 않는다. 움직이는 효과(김)는 없다.
    const fab = page.locator('#fabProfile');
    await expect(fab).toHaveClass(/fab-warm/);
    await expect(fab).toHaveClass(/warm-2/);
    await expect(fab.locator('.fab-steam, i')).toHaveCount(0);

    await page.evaluate(() => window.toggleProfileCard());
    await expect(page.locator('#pcDots .pc-dot').nth(1)).toHaveClass(/sig/);
    await page.locator('#pcDots .pc-dot').nth(1).click();
    // 밥친구 장을 봤으면 알림은 꺼진다 — 같은 친구로는 다시 뜨지 않는다(처음 한 번만)
    await expect(fab).not.toHaveClass(/fab-warm/);
    await page.evaluate(() => window.renderFriendsPage());
    await expect(fab).not.toHaveClass(/fab-warm/);
    // 이번 주 합석 줄에는 합석하는 친구만, 목록은 합석 많은 순
    const strip = page.locator('#friendsCard .fr-meal-strip .fr-meal');
    await expect(strip).toHaveCount(1);
    await expect(strip.first()).toContainText('팥밥-q7');
    // 같은 팀 2개(잠실·강동) → 한 그릇: 밥그릇이 2/3 차오른 아바타
    await expect(strip.first().locator('.fr-av.warm-2 svg clipPath')).toHaveCount(1);
    // 효과 없이 단계 색 테두리만
    await expect(strip.first().locator('.fr-steam, .fr-crumb')).toHaveCount(0);
    const anim = await strip.first().locator('.fr-av').evaluate((e) => window.getComputedStyle(e).animationName);
    expect(anim).toBe('none');
    const golden = await page.evaluate(() => window.t('fr_warm_2'));
    await expect(page.locator('#friendsCard .fr-row').first()).toContainText(golden);

    // 상세: 겹쳐 보기 위에 합석 칸 두 개
    await page.locator('#friendsCard .fr-row', { hasText: '팥밥-q7' }).click();
    await expect(page.locator('#friendsCard .fr-tt-blk.gs')).toHaveCount(2);
    const tag = await page.evaluate(() => window.tf('fr_meal_tier', { tier: window.t('fr_warm_2'), n: 2 }));
    await expect(page.locator('#friendsCard .fr-warm-tag')).toHaveText(tag);

    // 전부 숨기기로 바꾸면 합석도 없다 (서로 공개한 팀끼리만)
    await page.evaluate(() => { window.currentProfileData.friend_hide_all = true; window.syncFriendsBadge(); });
    expect(await page.evaluate(() => window.friendMeal('c').n)).toBe(0);
    await expect(fab).not.toHaveClass(/fab-warm/);
});
// 밥친구 4단계: 포장하기 '밥친구 포함' 스위치. 합석 친구가 없으면 잠기고, 있으면 켜서 다시 그린다.
// 같은 상태로 친구 상세의 합석 목록(글)도 본다.
test('밥친구 4단계: 포장하기 밥친구 포함 · 합석 목록', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        window.currentProfileData = {
            full_nickname: '현미밥-a3k', nickname: '현미밥', created_at: new Date('2026-07-01'),
            bookmarks: ['t1', 't3', null, null, null], customTeams: {}, friend_share_ok: true, friend_hidden: []
        };
        const clubs = {
            t1: { id: 't1', name: '잠실 배구회', schedule: '토 19:00-22:00' },
            t3: { id: 't3', name: '강동 화요반', schedule: '화 20:00-22:00' }
        };
        const orig = window.findClub;
        window.findClub = (id) => clubs[id] || (orig && orig(id));
        window._lb = {};
        window.peekFriendLunchbox = (o) => window._lb[o];
        window.loadFriendLunchbox = (o) => Promise.resolve(window._lb[o] || { status: 'none', teams: [] });
        const s = window.friendState;
        s.uid = 'me'; s.loaded = true;
        s.profiles = { c: { name: '팥밥-q7', color: '#F8BBD0' }, d: { name: '흑미밥-z9', color: '#FFF176' } };
        s.friends = [{ id: 'c_me', other: 'c', doc: { status: 'accepted' } }, { id: 'd_me', other: 'd', doc: { status: 'accepted' } }];
        window.updateProfileUI(true);
        window.renderFriendsPage();
        window.showShareOptions();
    });
    const tog = page.locator('#previewFriends');
    await expect(tog).toBeVisible();
    await expect(tog).toBeDisabled();                       // 합석 친구 없음 → 잠김
    await expect(tog).toHaveAttribute('aria-checked', 'false');

    // 합석 친구가 생기면 켤 수 있다. 전부 숨긴 친구(d)는 카드에 넣지 않는다.
    await page.evaluate(() => {
        window._lb.c = { status: 'ok', updatedMs: 1, teams: [{ id: 't1', name: '잠실 배구회', schedule: '토 19:00-22:00', slot: 0 }, { id: 't3', name: '강동 화요반', schedule: '화 20:00-22:00', slot: 1 }] };
        window._lb.d = { status: 'hidden', updatedMs: 1, teams: [] };
        window.selectMyCardShape('story');
    });
    await expect(tog).toBeEnabled();
    const size = () => page.evaluate(() => new Promise((res) => {
        const i = document.querySelector('#previewImgBox img');
        const done = () => res([i.naturalWidth, i.naturalHeight]);
        if (i.complete && i.naturalWidth) done(); else i.onload = done;
    }));
    await expect.poll(size).toEqual([1080, 1920]);
    await tog.click();
    await expect(tog).toHaveAttribute('aria-checked', 'true');
    await expect(tog).toHaveClass(/on/);
    await expect.poll(size).toEqual([1080, 1920]);
    const picked = await page.evaluate(() => window.buildMyCardData(true).friends.map((f) => [f.name, f.n, f.tier]));
    expect(picked).toEqual([['팥밥-q7', 2, 2]]);
    // 실제 폰트로 배치해도 밥친구 칸이 스텁 위에 붙고 도시락통은 최소치 이상
    const L = await page.evaluate(() => {
        const l = window.myCardLayout(window.buildMyCardData(true), false);
        return { frBot: l.friends.y + l.friends.h, limit: l.stubTop - window.SHARE_CARD.GAP, bento: l.bento.h };
    });
    expect(L.frBot).toBeLessThanOrEqual(L.limit + 0.01);
    expect(L.bento).toBeGreaterThanOrEqual(320);
    // 피드로 바꿔도 스위치 상태는 남는다
    await page.locator('#previewShape [data-shape="feed"]').click();
    await expect.poll(size).toEqual([1080, 1440]);
    await expect(tog).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => window.closePreview());

    // 친구 상세: 겹쳐 보기 아래 합석 목록을 글로 (요일 → 시각 순)
    await page.evaluate(() => { window.toggleProfileCard(); window.renderFriendsPage(); });
    await page.locator('#pcDots .pc-dot').nth(1).click();
    await expect(page.locator('#friendsCard .fr-meal-hint')).toBeVisible();
    await page.locator('#friendsCard .fr-row', { hasText: '팥밥-q7' }).click();
    const sess = page.locator('#friendsCard .fr-sess');
    await expect(sess).toHaveCount(2);
    await expect(sess.nth(0).locator('b')).toHaveText(/20–22$/);   // 화
    await expect(sess.nth(0).locator('span')).toHaveText('강동 화요반');
    await expect(sess.nth(1).locator('span')).toHaveText('잠실 배구회');
});

// 로그인 복귀 전용 주소: 쿼리를 그대로 들고 루트로 넘긴다(루트의 social-auth.js 가 처리).
// 앱이 루트를 App Link 로 열기 때문에 제공자는 이 주소로 돌려보낸다 — docs: auth/callback/index.html
test('로그인 복귀 주소(/auth/callback/)는 쿼리를 들고 루트로 넘긴다', async ({ page }) => {
    await page.goto('/auth/callback/?error=access_denied&state=naver_smoke');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    // 루트가 ?error=&state= 를 받아 처리하고 주소를 정리한다(취소 안내 후 쿼리 제거)
    page.on('dialog', (d) => d.dismiss());
    await expect.poll(() => new URL(page.url()).search).toBe('');
});
