import type { Page } from '@playwright/test';
import { expect, test } from '@nuxt/test-utils/playwright';
import {
  addMediaViaUI,
  createTokenViaUI,
  deleteTestData,
  login,
  stubProviderCalls,
  uniqueId,
} from '../support/admin';

/** `yyyy-mm-dd` of a moment in local time, the way the page names its daily buckets. */
function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The label the chart's table view gives a day. */
function dayLabel(date: Date) {
  return date.toLocaleDateString('en', { dateStyle: 'full' });
}

interface HistoryStub {
  token: {
    id: string
    token: string
    name: string
    mediaId: string | null
    groupId: string | null
    createdAt: string
    firstUsedAt: string | null
    expiresAt: string | null
    validFor: Record<string, number> | null
    usageLimit: number | null
    usageCount: number
  }
  targetTitle: string | null
  views: Array<{ id: string, tokenId: string, mediaId: string, mediaTitle: string, viewedAt: string }>
}

/**
 * Stands in for a token's history. Spending a view for real would mean fetching
 * the embed from the provider, which no test may do, so the history endpoint is
 * answered here and the test checks what the admin is shown.
 */
async function mockTokenHistory(page: Page, history: HistoryStub) {
  await page.route(/\/api\/tokens\/[^/]+\/views$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(history) });
  });
}

function historyStub(overrides: Partial<HistoryStub['token']>, views: HistoryStub['views'], targetTitle: string): HistoryStub {
  return {
    token: {
      id: 't1',
      token: 'e2e0000000000000000000000000abcd',
      name: '1',
      mediaId: 'm1',
      groupId: null,
      createdAt: new Date('2026-10-01T08:00:00.000Z').toISOString(),
      firstUsedAt: views.at(-1)?.viewedAt ?? null,
      expiresAt: null,
      validFor: null,
      usageLimit: 3,
      usageCount: views.length,
      ...overrides,
    },
    targetTitle,
    views,
  };
}

test.beforeEach(async ({ page }) => {
  await stubProviderCalls(page);
});

test.afterEach(async ({ page }) => {
  await deleteTestData(page);
});

test.describe('Usage statistics', () => {
  test('shows when a token spent its views, and how many have no record', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    await page.getByRole('row').filter({ hasText: title }).click();
    const token = await createTokenViaUI(page, `Batch ${uniqueId(testInfo.testId)}`, 1, { usageLimit: 3 });

    const newest = new Date('2026-10-12T14:05:00.000Z');
    const oldest = new Date('2026-10-10T09:30:00.000Z');
    const views = [
      { id: 'v2', tokenId: 't1', mediaId: 'm1', mediaTitle: title, viewedAt: newest.toISOString() },
      { id: 'v1', tokenId: 't1', mediaId: 'm1', mediaTitle: title, viewedAt: oldest.toISOString() },
    ];
    // Three views spent, two of them recorded: the third predates the history.
    await mockTokenHistory(page, historyStub({ token, usageCount: 3 }, views, title));

    await page.getByRole('button', { name: 'History' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'History of token 1' })).toBeVisible();
    await expect(dialog.getByText(token)).toBeVisible();
    await expect(dialog.getByText(title)).toBeVisible();
    await expect(dialog.getByText('3 / 3')).toBeVisible();
    await expect(dialog.getByText('1 view was spent before the history was kept and has no entry here.')).toBeVisible();
    const rows = dialog.getByRole('row').filter({ hasText: /2026/ });
    await expect(rows).toHaveCount(2);
    // Newest first, so the admin sees the view that used the token up at the top.
    await expect(rows.first()).toContainText(newest.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }));
    await expect(rows.last()).toContainText(oldest.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }));
  });

  test('says so when a token has not been opened yet', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    await page.getByRole('row').filter({ hasText: title }).click();
    const token = await createTokenViaUI(page, `Batch ${uniqueId(testInfo.testId)}`, 1);

    await mockTokenHistory(page, historyStub({ token, usageLimit: null, usageCount: 0 }, [], title));

    await page.getByRole('button', { name: 'History' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Not opened yet')).toBeVisible();
    await expect(dialog.getByText('Does not expire')).toBeVisible();
    await expect(dialog.getByText('This token has not spent any view yet.')).toBeVisible();
    await expect(dialog.getByText(/before the history was kept/)).toHaveCount(0);
  });

  test('counts the views of a period per day, per media and one by one', async ({ page }) => {
    await login(page);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const requested: string[] = [];
    await page.route(/\/api\/statistics\?/, async (route) => {
      requested.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 5,
          tokens: 2,
          buckets: { [dayKey(today)]: 3, [dayKey(threeDaysAgo)]: 2 },
          media: [{ mediaId: 'm1', title: 'E2E Stats Video', views: 5, tokens: 2, lastViewedAt: today.toISOString() }],
          recent: [{
            id: 'v1',
            viewedAt: today.toISOString(),
            mediaId: 'm1',
            mediaTitle: 'E2E Stats Video',
            tokenId: 't1',
            tokenName: '7',
            token: 'e2e0000000000000000000000000abcd',
            batchId: 'b1',
            batchName: 'E2E Stats Batch',
            groupId: null,
            groupName: null,
          }],
          recentLimit: 50,
        }),
      });
    });

    await page.getByRole('link', { name: 'Statistics' }).click();
    await expect(page).toHaveURL('/statistics');

    // The headline numbers.
    await expect(page.getByText('Tokens used').locator('..')).toContainText('2');
    await expect(page.getByText('Media watched').locator('..')).toContainText('1');

    // The day buckets, read off the chart's table view.
    await page.getByRole('button', { name: 'Show as table' }).click();
    await expect(page.getByRole('row').filter({ hasText: dayLabel(today) })).toContainText('3');
    await expect(page.getByRole('row').filter({ hasText: dayLabel(threeDaysAgo) })).toContainText('2');
    // Thirty days, today included, quiet ones listed as zero. Only the chart's
    // rows start with a weekday; the tables below start with a title or a date.
    await expect(page.getByRole('row').filter({ hasText: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), / })).toHaveCount(30);

    // Per media, and the latest views with their token and batch.
    await expect(page.getByRole('row').filter({ hasText: 'E2E Stats Video' }).first()).toContainText('5');
    const recent = page.getByRole('row').filter({ hasText: 'E2E Stats Batch' });
    await expect(recent).toContainText('e2e0000000000000000000000000abcd');

    // The page asks in its own time zone and, for a year, per month.
    expect(requested[0]).toContain('granularity=day');
    expect(requested[0]).toContain(`timeZone=${encodeURIComponent(new Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
    await page.getByLabel('Period').click();
    await page.getByRole('option', { name: 'Last 12 months' }).click();
    await expect.poll(() => requested.at(-1)).toContain('granularity=month');
    await expect(page.getByRole('heading', { name: 'Views per month' })).toBeVisible();

    // A view in the list leads to the history of the token that spent it.
    await mockTokenHistory(page, historyStub({ name: '7' }, [], 'E2E Stats Video'));
    await recent.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'History of token 7' })).toBeVisible();
  });

  test('opens the statistics of one media from its page', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    await page.getByRole('row').filter({ hasText: title }).click();
    await expect(page).toHaveURL(/\/media\/([^/?]+)/);
    const mediaId = page.url().match(/\/media\/([^/?]+)/)?.[1];

    const requested: string[] = [];
    await page.route(/\/api\/statistics\?/, async (route) => {
      requested.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, tokens: 0, buckets: {}, media: [], recent: [], recentLimit: 50 }),
      });
    });

    // The page's own button, not the navigation entry of the same name.
    await page.getByRole('main').getByRole('link', { name: 'Statistics' }).click();

    await expect(page).toHaveURL(new RegExp(`/statistics\\?mediaId=${mediaId}`));
    await expect(page.getByLabel('Media', { exact: true })).toContainText(title);
    await expect.poll(() => requested.at(-1)).toContain(`mediaId=${mediaId}`);
    await expect(page.getByText('No views in this period.').first()).toBeVisible();
  });
});
