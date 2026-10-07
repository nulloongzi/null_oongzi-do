// tests/smoke/review.spec.js — 알림에서 바로 심사(review.html) 확인 페이지.
// 서버(reviewRequest)는 page.route 로 대신한다. 서버 쪽 동작은 tests/review-link.test.js.
//  · 링크를 연다고 처리되지 않는다 — info 만 부르고, 버튼을 눌러야 approve/reject 를 부른다
//  · 거절은 사유를 골라야 버튼이 켜지고, 고른 사유가 그대로 간다
//  · 서명이 틀린 링크(403)는 그렇다고 말한다
'use strict';

const { test, expect } = require('@playwright/test');

const ENDPOINT = 'https://us-central1-nulloongzi-do.cloudfunctions.net/reviewRequest';
const INFO = {
    found: true, kind: 'admin', status: 'pending', club_name: '누룽지팀',
    club_url: 'https://do.nulloongzi.com/?club=c1', requested_at: Date.UTC(2026, 9, 6),
    photo_url: '', admin_count: 1, admin_max: 3,
    reasons: [
        { code: 'photo_unclear', label: '사진으로 확인 안 됨' },
        { code: 'photo_unrelated', label: '관련 없는 사진' },
        { code: 'duplicate', label: '중복 신청' },
        { code: 'other', label: '기타' }
    ]
};

async function mockServer(page, handler) {
    const calls = [];
    await page.route(ENDPOINT, async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        calls.push(body);
        const r = handler(body);
        await route.fulfill({
            status: r.status || 200,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(r.body)
        });
    });
    return calls;
}

test('관리자 신청 거절: 사유를 골라야 거절되고, 여는 것만으로는 아무것도 안 한다', async ({ page }) => {
    const calls = await mockServer(page, (b) => {
        if (b.op === 'info') return { body: INFO };
        return { body: { outcome: 'rejected', message: '❌ 거절했어요.\n대상: 누룽지팀\n사유: 관련 없는 사진' } };
    });
    await page.goto('/review.html?k=admin&id=r1&t=' + 'a'.repeat(32) + '&a=reject');
    await expect(page.locator('#team')).toContainText('누룽지팀');
    await expect(page.locator('#info')).toContainText('지금 관리자 1/3명');
    expect(calls.map((c) => c.op)).toEqual(['info']);

    // 알림에서 거절을 눌렀으면 거절 칸이 먼저 온다
    const first = page.locator('#decide > .card').first();
    await expect(first).toHaveAttribute('id', 'rejectCard');

    const reject = page.locator('#rejectBtn');
    await expect(reject).toBeDisabled();
    await page.getByRole('button', { name: '관련 없는 사진' }).click();
    await expect(reject).toBeEnabled();
    await reject.click();
    await expect(page.locator('#msg')).toContainText('거절했어요');
    await expect(page.locator('#decide')).toBeHidden();
    expect(calls[1]).toMatchObject({ k: 'admin', id: 'r1', op: 'reject', reason: 'photo_unrelated' });
});

test('승인: 버튼을 눌러야 승인하고, 서버가 실패하면 다시 누를 수 있다', async ({ page }) => {
    let fail = true;
    const calls = await mockServer(page, (b) => {
        if (b.op === 'info') return { body: INFO };
        if (fail) { fail = false; return { status: 500, body: { error: 'server', message: '처리하지 못했어요. 요청은 대기 중 그대로예요 — 잠시 후 다시 눌러 주세요.' } }; }
        return { body: { outcome: 'approved', message: '✅ 승인했어요.\n대상: 누룽지팀\n관리자 2/3명' } };
    });
    await page.goto('/review.html?k=admin&id=r1&t=' + 'a'.repeat(32) + '&a=approve');
    await page.locator('#approveBtn').click();
    await expect(page.locator('#msg')).toContainText('대기 중 그대로');
    await expect(page.locator('#approveBtn')).toBeEnabled();
    await page.locator('#approveBtn').click();
    await expect(page.locator('#msg')).toContainText('승인했어요');
    expect(calls.map((c) => c.op)).toEqual(['info', 'approve', 'approve']);
});

test('이미 처리된 신청은 결과만 보이고 버튼이 없다', async ({ page }) => {
    await mockServer(page, () => ({ body: Object.assign({}, INFO, { status: 'rejected', reject_reason: 'other' }) }));
    await page.goto('/review.html?k=admin&id=r1&t=' + 'a'.repeat(32));
    await expect(page.locator('#msg')).toContainText('이미 처리된 신청');
    await expect(page.locator('#decide')).toBeHidden();
});

test('서명이 틀린 링크·빠진 링크는 그렇다고 말한다', async ({ page }) => {
    await mockServer(page, () => ({ status: 403, body: { error: 'bad_link' } }));
    await page.goto('/review.html?k=admin&id=r1&t=' + 'b'.repeat(32));
    await expect(page.locator('#msg')).toContainText('이 링크로는 처리할 수 없어요');
    await page.goto('/review.html?k=admin');
    await expect(page.locator('#msg')).toContainText('링크가 온전하지 않아요');
});
