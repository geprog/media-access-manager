import type { Page } from '@playwright/test';
import { expect, test } from '@nuxt/test-utils/playwright';
import {
  addMediaViaUI,
  deleteTestData,
  login,
  stubProviderCalls,
  uniqueId,
  videoEmbed,
} from '../support/admin';

/**
 * Purchases run against `e2e/support/mollieStub.ts`, which the Playwright
 * config starts and points the app server at: the app really creates, updates
 * and reads payments, just not at Mollie. The stub's checkout page offers
 * "Pay" and "Cancel" in place of Mollie's hosted one.
 */

async function openMediaViaUI(page: Page, title: string): Promise<string> {
  await page.getByRole('row').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/media\/[^/]+/);
  return page.url().split('/media/')[1] ?? '';
}

/** Admin API calls run inside the page, for the `Secure` cookie reason in `deleteTestData`. */
async function setMediaPrices(page: Page, mediaId: string, prices: { priceMonth: number | null, priceYear: number | null }) {
  await page.evaluate(async ({ id, body }) => {
    await fetch(`/api/media/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }, { id: mediaId, body: prices });
}

/** Only the admin API can hand out a token whose window already closed. */
async function createExpiredToken(page: Page, mediaId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const response = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mediaId: id,
        name: 'expired',
        usageLimit: 3,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
    });
    const created: { token: string } = await response.json();
    return created.token;
  }, mediaId);
}

interface TokenRow { token: string, expiresAt: string | null, usageLimit: number | null }

async function readToken(page: Page, mediaId: string, token: string): Promise<TokenRow | undefined> {
  await login(page);
  const rows = await page.evaluate(async (id) => {
    const response = await fetch(`/api/tokens?mediaId=${id}`);
    return response.json() as Promise<TokenRow[]>;
  }, mediaId);
  return rows.find(row => row.token === token);
}

/** Media with prices and an expired token, seen by a visitor without admin session. */
async function visitExpiredPricedMedia(page: Page, title: string) {
  await login(page);
  await addMediaViaUI(page, title);
  const mediaId = await openMediaViaUI(page, title);
  await setMediaPrices(page, mediaId, { priceMonth: 900, priceYear: 4900 });
  const token = await createExpiredToken(page, mediaId);
  await page.context().clearCookies();
  await page.goto(`/${token}`);
  await expect(page.getByText(/access to this video has ended/i)).toBeVisible({ timeout: 5000 });
  return { mediaId, token };
}

test.beforeEach(async ({ page }) => {
  await stubProviderCalls(page);
});

test.afterEach(async ({ page }) => {
  await deleteTestData(page);
});

test.describe('Buying access again', () => {
  test('admin sets the prices of a media', async ({ page }, testInfo) => {
    await login(page);
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    await openMediaViaUI(page, title);

    await page.getByLabel('Price for 1 month').fill('9.99');
    await page.getByLabel('Price for 1 year').fill('49');
    await page.getByRole('button', { name: 'Save prices' }).click();
    await expect(page.getByText('Prices saved')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Price for 1 month')).toHaveValue('€9.99');
    await expect(page.getByLabel('Price for 1 year')).toHaveValue('€49.00');
  });

  test('a visitor pays for a year and watches again', async ({ page }, testInfo) => {
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    const { mediaId, token } = await visitExpiredPricedMedia(page, title);

    await expect(page.getByRole('button', { name: '1 month for €9.00' })).toBeVisible();
    // Buying is the quickest way back, but asking support stays available.
    await expect(page.getByRole('link', { name: /request further access/i })).toBeVisible();
    await page.getByRole('button', { name: '1 year for €49.00' }).click();

    // The customer sees what they pay for on the checkout page.
    await expect(page.getByRole('heading', { name: `${title} – 1 year access` })).toBeVisible();
    await expect(page.getByText('49.00 EUR')).toBeVisible();

    // The real access endpoint would now fetch the embed from Vimeo.
    await page.route(/\/api\/access\/[^/]+$/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'media',
        title,
        embed: videoEmbed('E2E Purchased Video'),
        access: { expiresAt: null, usageLimit: null, usageCount: 1 },
      }),
    }));
    await page.getByRole('button', { name: 'Pay' }).click();

    await expect(page.locator('iframe[title="E2E Purchased Video"]')).toBeVisible({ timeout: 10000 });
    // The payment id is dropped from the address once it has been confirmed.
    await expect(page).toHaveURL(`/${token}`);

    // The token itself was renewed: a year from now, and no view limit.
    const renewed = await readToken(page, mediaId, token);
    const expiresAt = new Date(renewed?.expiresAt ?? 0).getTime();
    const inAYear = Date.now() + 365 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - inAYear)).toBeLessThan(2 * 24 * 60 * 60 * 1000);
    expect(renewed?.usageLimit).toBeNull();
  });

  test('a canceled payment offers the purchase again', async ({ page }, testInfo) => {
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    const { mediaId, token } = await visitExpiredPricedMedia(page, title);

    await page.getByRole('button', { name: '1 month for €9.00' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByText('The payment was not completed.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/access to this video has ended/i)).toBeVisible();
    await expect(page.getByRole('button', { name: '1 month for €9.00' })).toBeVisible();

    const unchanged = await readToken(page, mediaId, token);
    expect(new Date(unchanged?.expiresAt ?? 0).getTime()).toBeLessThan(Date.now());
    expect(unchanged?.usageLimit).toBe(3);
  });

  test('offers nothing to buy for media without prices', async ({ page }, testInfo) => {
    await login(page);
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    const mediaId = await openMediaViaUI(page, title);
    const token = await createExpiredToken(page, mediaId);
    await page.context().clearCookies();
    await page.goto(`/${token}`);

    await expect(page.getByText(/access to this video has ended/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /request further access/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /for €/ })).toHaveCount(0);
  });

  test('a group whose media are partly used up offers the purchase beside the list', async ({ page }) => {
    // Spending a group's views needs the provider's embed, so the list with one
    // media used up comes from a stand-in for the access endpoint.
    await page.route(/\/api\/access\/[^/]+$/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'group',
        title: 'E2E Group',
        access: { expiresAt: null, usageLimit: 1 },
        media: [
          { id: 'a', title: 'E2E Watched', blockedBy: 'usage_limit_reached', usageLimit: 1, usageCount: 1 },
          { id: 'b', title: 'E2E Fresh', blockedBy: null, usageLimit: 1, usageCount: 0 },
        ],
        purchaseOptions: [{ period: 'year', amount: 12900, currency: 'EUR' }],
      }),
    }));
    await page.goto('/e2e-group-token');

    await expect(page.getByText(/can no longer be opened/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '1 year for €129.00' })).toBeVisible();
    // Only the periods that have a price are offered.
    await expect(page.getByRole('button', { name: /1 month for/ })).toHaveCount(0);
  });
});
