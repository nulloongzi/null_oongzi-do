// tests/smoke/anchigi.spec.js — 안치기(anchigi.html) 헤드리스 스모크.
//
// tests/anchigi-solver.test.js 가 솔버·명단 모델을 vm 샌드박스에서 검증한다면,
// 여기서는 그 위의 화면을 실제 브라우저에서 한 바퀴 돌린다. 렌더가 깨지거나
// 버튼이 엉뚱한 걸 부르는 회귀는 여기서만 잡힌다.
//
// 검증:
//  · 페이지 에러 0 (안치기는 외부 SDK를 쓰지 않아 예외 허용이 필요 없다)
//  · 명단: 여러 명 붙여넣기, '어디든' 배지, 자리 칩 순환, 고정(📌)
//  · 배치: 뽑기 → 경기 탭 하나씩 · 하단 고정 바 · 간단히 보기
//  · 인원이 모자라면 막지 않고 빈 자리를 (필요)로 표시
//  · 6인제 5-1 / 6-2, 9인제 포메이션(속공 수)별 자리 이름
//  · 확정 → 기록 · 지난 라운드
'use strict';

const { test, expect } = require('@playwright/test');

// 정적 서버가 안 주는 것(파비콘 등)의 404 는 우리 코드 문제가 아니다.
const RESOURCE_404 = /Failed to load resource|favicon/i;

/** 안치기는 외부 SDK를 안 쓴다 — 그 외 에러는 전부 회귀로 본다. */
function collectPageErrors(page, sink) {
    page.on('pageerror', (err) => sink.push(err));
    page.on('console', (m) => {
        if (m.type() === 'error' && !RESOURCE_404.test(m.text())) {
            sink.push(new Error(m.text()));
        }
    });
}

/** 명단 탭에서 이름만 붙여넣어 n명 추가한다(자리는 '어디든'). */
async function seedRoster(page, n) {
    await page.click('.tab[data-t="1"]');
    const names = Array.from({ length: n }, (_, i) => `선수${i + 1}`).join('\n');
    await page.fill('#bulkTa', names);
    await page.click('#bulkAdd');
    await expect(page.locator('.prow')).toHaveCount(n);
}

/** 설정 카드(접이식)를 펼친다. 결과가 있으면 접혀 있다. */
async function openSettings(page) {
    const card = page.locator('#p0 > details.fold-card').nth(1);
    if (!(await card.evaluate((e) => e.open))) {
        await card.locator('> summary').click();
    }
    await expect(card.locator('#sport')).toBeVisible();
}

/** 뽑고 결과가 나올 때까지 기다린다. */
async function draw(page) {
    await page.click('#go');
    await expect(page.locator('.action-bar')).toBeVisible({ timeout: 20_000 });
}

test.use({ viewport: { width: 412, height: 900 } });

test('로드: 탭 4개 + 페이지 에러 0', async ({ page }) => {
    const errors = [];
    collectPageErrors(page, errors);
    await page.goto('/anchigi.html');
    await expect(page.locator('.tab[data-t]')).toHaveCount(4);
    await expect(page.locator('.intro-card')).toBeVisible(); // 명단이 비면 온보딩
    await page.waitForTimeout(800);
    expect(errors, errors.map(String).join('\n')).toEqual([]);
});

test('명단: 붙여넣기로 여러 명 + 자리 미지정은 어디든', async ({ page }) => {
    await page.goto('/anchigi.html');
    await seedRoster(page, 12);
    // 자리를 안 골랐으니 전원 '어디든'
    await expect(page.locator('.flexbadge')).toHaveCount(12);

    // 첫 칩을 누르면 주 자리가 되고 배지가 사라진다
    const first = page.locator('.prow').first();
    await first.locator('.ptoggle button').first().click();
    await expect(first.locator('.flexbadge')).toHaveCount(0);
    await expect(first.locator('.ptoggle button').first()).toHaveAttribute('data-tier', 'main');

    // 📌 고정 — 주 자리에 걸린다
    await first.locator('.pinbtn').click();
    await expect(first.locator('.pinbtn')).toHaveAttribute('aria-pressed', 'true');
});

test('배치: 경기 하나씩 + 하단 고정 바 + 간단히 보기', async ({ page }) => {
    const errors = [];
    collectPageErrors(page, errors);
    await page.goto('/anchigi.html');
    await seedRoster(page, 12);
    await page.click('.tab[data-t="0"]');
    await draw(page);

    // 경기 탭 셋에 코트는 한 장
    await expect(page.locator('#gsel button')).toHaveCount(3);
    await expect(page.locator('.game')).toHaveCount(1);
    await expect(page.locator('.game .game-title')).toContainText('경기 1');

    // 2경기로 전환
    await page.locator('#gsel button[data-g="1"]').click();
    await expect(page.locator('.game .game-title')).toContainText('경기 2');

    // 간단히 보기는 세 경기를 한눈에
    await page.locator('#view button[data-v="list"]').click();
    await expect(page.locator('.game')).toHaveCount(3);
    await expect(page.locator('.court')).toHaveCount(0);
    await expect(page.locator('.lineup-list .tline')).toHaveCount(6);

    // 하단 고정 바는 배치 탭에서만
    await page.click('.tab[data-t="1"]');
    await expect(page.locator('.action-bar')).toHaveCount(0);
    await page.click('.tab[data-t="0"]');
    await expect(page.locator('.action-bar')).toBeVisible();

    expect(errors, errors.map(String).join('\n')).toEqual([]);
});

test('인원이 모자라면 막지 않고 빈 자리를 (필요)로 남긴다', async ({ page }) => {
    await page.goto('/anchigi.html');
    await seedRoster(page, 9);            // 6인제 한 경기는 12명
    await page.click('.tab[data-t="0"]');
    await expect(page.locator('.msg.info')).toContainText('빈 자리');
    await draw(page);

    const need = page.locator('.cell.need');
    await expect(need.first()).toBeVisible();
    await expect(need.first()).toContainText('(필요)');
    // 빈자리는 두 팀에 고르게 — 한쪽만 텅 비지 않는다
    const perSide = await page.locator('.side').evaluateAll(
        (sides) => sides.map((s) => s.querySelectorAll('.cell.need').length)
    );
    expect(Math.abs(perSide[0] - perSide[1])).toBeLessThanOrEqual(2);
});

test('6인제 6-2: 코트에 세터가 둘, 하나는 라이트 자리', async ({ page }) => {
    await page.goto('/anchigi.html');
    await seedRoster(page, 12);
    await page.click('.tab[data-t="0"]');
    await openSettings(page);
    await page.click('#tactic button[data-tc="6-2"]');
    await draw(page);

    const setters = page.locator('.side').first().locator('.pos.S');
    await expect(setters).toHaveCount(2);
    await expect(page.locator('.side').first()).toContainText('세터 · 라이트');
});

test('9인제: 포메이션 셋 + 자리 이름이 코트에 나온다', async ({ page }) => {
    const errors = [];
    collectPageErrors(page, errors);
    await page.goto('/anchigi.html');
    await seedRoster(page, 18);
    await page.click('.tab[data-t="0"]');
    await openSettings(page);
    await page.click('#sport button[data-s="v9"]');

    // 속공 1 · 2 · 3 세 가지
    await openSettings(page);
    await expect(page.locator('#form button')).toHaveCount(3);
    // 속공 2(3-4-2)만 남긴다
    await page.click('#form button[data-id="v9q1"]');
    await openSettings(page);
    await page.click('#form button[data-id="v9q3"]');
    await draw(page);

    const side = page.locator('.side').first();
    await expect(side.locator('.cell')).toHaveCount(9);
    await expect(side).toContainText('앞속공');
    await expect(side).toContainText('빽차');
    await expect(side).toContainText('센터백');
    // 속공 2 · 3 에는 수비 전환 메모가 붙는다
    await expect(page.locator('.game')).toContainText('뒤로 빠져');

    expect(errors, errors.map(String).join('\n')).toEqual([]);
});

test('확정: 기록에 쌓이고 지난 라운드로 넘어간다', async ({ page }) => {
    await page.goto('/anchigi.html');
    await seedRoster(page, 12);
    await page.click('.tab[data-t="0"]');
    await draw(page);
    await page.locator('.action-bar #fix').click();

    // 결과가 비워지고 지난 라운드가 생긴다
    await expect(page.locator('.action-bar')).toHaveCount(0);
    await expect(page.locator('.past-round')).toHaveCount(1);
    await expect(page.locator('#go')).toContainText('2R');

    // 기록 탭에 출전이 쌓인다
    await page.click('.tab[data-t="2"]');
    await expect(page.locator('#p2 tbody tr')).toHaveCount(12);
    const played = await page.locator('#p2 tbody tr td:nth-child(2)').allInnerTexts();
    expect(played.every((x) => Number(x) > 0)).toBe(true);
});

test('모임 보관: 기록만 새로 시작하고 명단은 남는다', async ({ page }) => {
    await page.goto('/anchigi.html');
    await seedRoster(page, 12);
    await page.click('.tab[data-t="0"]');
    await draw(page);
    await page.locator('.action-bar #fix').click();

    await page.click('.tab[data-t="2"]');
    page.once('dialog', (d) => d.accept());
    await page.click('#arch');

    // 보관한 모임 줄(날짜 + 라운드 수). 해가 바뀌어도 깨지지 않게 형태로 본다.
    await expect(page.locator('#p2')).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(page.locator('#p2 tbody tr')).toHaveCount(0); // 누적 기록은 비었다
    await page.click('.tab[data-t="1"]');
    await expect(page.locator('.prow')).toHaveCount(12);       // 명단은 그대로
});
