import type { APIRequestContext, Page } from '@playwright/test';
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

/** Changes a payment at the Mollie stand-in the way Mollie would on its own. */
function setStubPaymentStatus(request: APIRequestContext, paymentId: string | undefined, status: string) {
  return request.post(new URL(`../__payments/${paymentId}/${status}`, process.env.NUXT_MOLLIE_API_ENDPOINT).href);
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

  test('a visitor pays for a year and watches again', async ({ page, request }, testInfo) => {
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
    // The return marker is dropped from the address once the payment is confirmed.
    await expect(page).toHaveURL(`/${token}`);
    // Mollie is told nothing but the token page to come back to.
    const sent: Array<{ redirectUrl: string }> = await (await request.get(
      new URL('../__payments', process.env.NUXT_MOLLIE_API_ENDPOINT).href,
    )).json();
    expect(sent.at(-1)?.redirectUrl).toMatch(new RegExp(`/${token}$`));

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

  test('a visitor who leaves the checkout continues the same payment', async ({ page }, testInfo) => {
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    const { mediaId, token } = await visitExpiredPricedMedia(page, title);

    await page.getByRole('button', { name: '1 month for €9.00' }).click();
    await page.waitForURL(/\/checkout\/tr_/);
    const checkoutUrl = page.url();
    // Mollie's link back to the shop leaves the payment open until it expires,
    // so it is neither "being processed" nor over.
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByText(/started a payment that is not finished/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/being processed|not completed/i)).toHaveCount(0);
    // No second payment: buying is replaced by continuing the one begun.
    await expect(page.getByRole('button', { name: /for €/ })).toHaveCount(0);
    await expect(page).toHaveURL(`/${token}`);

    // Reloading must not forget it either: the token remembers its payment.
    await page.reload();
    await page.getByRole('button', { name: 'Continue payment' }).click();
    await expect(page).toHaveURL(checkoutUrl);

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

    const renewed = await readToken(page, mediaId, token);
    expect(renewed?.usageLimit).toBeNull();
  });

  test('offers buying again once Mollie lets an open payment expire', async ({ page, request }, testInfo) => {
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    const { token } = await visitExpiredPricedMedia(page, title);

    await page.getByRole('button', { name: '1 year for €49.00' }).click();
    await page.waitForURL(/\/checkout\/tr_/);
    const paymentId = page.url().split('/checkout/')[1];
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'Continue payment' })).toBeVisible({ timeout: 10000 });

    // No webhook reaches a local server, so the page asks Mollie itself.
    const expired = await setStubPaymentStatus(request, paymentId, 'expired');
    expect(expired.ok()).toBe(true);
    await page.goto(`/${token}`);

    await expect(page.getByRole('button', { name: '1 year for €49.00' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Continue payment' })).toHaveCount(0);
  });

  test('opening a token whose payment is being processed waits for it', async ({ page, request }, testInfo) => {
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    const { token } = await visitExpiredPricedMedia(page, title);

    await page.getByRole('button', { name: '1 month for €9.00' }).click();
    await page.waitForURL(/\/checkout\/tr_/);
    const paymentId = page.url().split('/checkout/')[1];
    // Processing goes on at Mollie while the visitor opens their link again,
    // without coming back from the checkout.
    expect((await setStubPaymentStatus(request, paymentId, 'pending')).ok()).toBe(true);
    await page.goto(`/${token}`);

    await expect(page.getByText(/payment is being processed/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/access to this video has ended/i)).toHaveCount(0);
    // The Mollie dashboard is the account's own view, not the visitor's.
    await expect(page.getByRole('link', { name: 'View payment in Mollie' })).toHaveCount(0);

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
    expect((await setStubPaymentStatus(request, paymentId, 'paid')).ok()).toBe(true);
    await expect(page.locator('iframe[title="E2E Purchased Video"]')).toBeVisible({ timeout: 10000 });
  });

  test('shows an admin the payment in Mollie while it is processed', async ({ page, request }, testInfo) => {
    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    const { token } = await visitExpiredPricedMedia(page, title);
    await page.getByRole('button', { name: '1 month for €9.00' }).click();
    await page.waitForURL(/\/checkout\/tr_/);
    const paymentId = page.url().split('/checkout/')[1];
    expect((await setStubPaymentStatus(request, paymentId, 'pending')).ok()).toBe(true);

    await login(page);
    await page.goto(`/${token}`);

    await expect(page.getByText(/payment is being processed/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'View payment in Mollie' }))
      .toHaveAttribute('href', new RegExp(`/dashboard/payments/${paymentId}$`));
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
