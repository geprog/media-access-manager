import type { CreatePaymentBody, MolliePayment } from '../utils/mollieApi';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

const sqlite = new Database(':memory:');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'server', 'db', 'migrations') });

vi.mock('../utils/db', () => ({
  useDb: () => db,
  generateId: () => randomBytes(12).toString('hex'),
}));

/**
 * Mollie, reduced to what the service reads and writes: payments are created
 * `open` without a method, and a test moves them on the way Mollie would —
 * the customer paying, an attempt failing, the payment expiring.
 */
const payments = new Map<string, MolliePayment>();
let paymentCounter = 0;

function notFound() {
  return Object.assign(new Error('Not Found'), { statusCode: 404 });
}

const mollie = {
  createPayment: vi.fn(async (body: CreatePaymentBody): Promise<MolliePayment> => {
    const id = `tr_${++paymentCounter}`;
    const payment: MolliePayment = {
      id,
      status: 'open',
      method: null,
      amount: body.amount,
      createdAt: new Date().toISOString(),
      isCancelable: false,
      description: body.description,
      metadata: body.metadata,
      _links: {
        checkout: { href: `https://checkout.example/${id}` },
        dashboard: { href: `https://dashboard.example/${id}` },
      },
    };
    payments.set(id, payment);
    return structuredClone(payment);
  }),
  getPayment: vi.fn(async (id: string): Promise<MolliePayment> => {
    const payment = payments.get(id);
    if (!payment) {
      throw notFound();
    }
    return structuredClone(payment);
  }),
  cancelPayment: vi.fn(async (id: string): Promise<MolliePayment> => {
    const payment = payments.get(id);
    if (!payment) {
      throw notFound();
    }
    if (!payment.isCancelable) {
      throw Object.assign(new Error('Unprocessable Entity'), { statusCode: 422 });
    }
    Object.assign(payment, { status: 'canceled', isCancelable: false });
    delete payment._links.checkout;
    return structuredClone(payment);
  }),
};

vi.mock('../utils/mollieApi', () => ({ createMollieApi: () => mollie }));

// The deployment: purchasing on, prices in euro, and the translation files
// as Nitro would serve them, read from disk.
vi.mock('../utils/paymentSettings', () => ({
  getMollieSettings: () => ({ apiKey: 'test_key', apiEndpoint: '' }),
  getPaymentCurrency: () => 'EUR',
  loadLocaleMessages: async (locale: string) => {
    try {
      return JSON.parse(readFileSync(path.resolve(process.cwd(), 'i18n', 'locales', `${locale}.json`), 'utf8'));
    }
    catch {
      return null;
    }
  },
}));

const {
  cancelOpenPayment,
  confirmPayment,
  confirmTokenPayment,
  getPurchaseOffer,
  PaymentInProgressError,
  PurchaseUnavailableError,
  startPurchase,
} = await import('./paymentService');
const { applyTokenPurchase, createToken, findTokenByValue, hasTokenPurchase } = await import('./tokenService');
const { createMedia, updateMediaPrices } = await import('./mediaService');
const { listOpenPaymentNotices } = await import('./paymentNoticeService');

let counter = 0;

async function pricedMedia() {
  const id = randomBytes(12).toString('hex');
  await createMedia({ id, title: `Video ${++counter}`, providerConfig: { providerId: 'vimeo', videoId: String(counter) } });
  await updateMediaPrices(id, { priceMonth: 900, priceYear: 4900 });
  return id;
}

/** A token whose month ran out yesterday, so it is for sale. */
async function expiredToken() {
  return createToken({
    mediaId: await pricedMedia(),
    name: 'expired',
    usageLimit: 3,
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
}

function purchase(token: string, period: 'month' | 'year') {
  return startPurchase({ tokenValue: token, period, locale: 'en', origin: 'https://app.example' });
}

/** The payment id a checkout URL of the stand-in leads to. */
function paymentIdOf(checkoutUrl: string) {
  return checkoutUrl.split('/').at(-1)!;
}

/** What Mollie reports after a failed attempt: still open, with the method, without the checkout link. */
function failAttempt(paymentId: string) {
  const payment = payments.get(paymentId)!;
  payment.method = 'paypal';
  delete payment._links.checkout;
}

function markPaid(paymentId: string) {
  const payment = payments.get(paymentId)!;
  Object.assign(payment, { status: 'paid', method: 'creditcard' });
  delete payment._links.checkout;
}

beforeEach(() => {
  for (const table of ['payment_notices', 'token_purchases', 'token_views', 'token_media_usage', 'tokens', 'batches', 'media']) {
    sqlite.prepare(`DELETE FROM ${table}`).run();
  }
  payments.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('switching periods', () => {
  it('leads back to the payment set aside once the one that replaced it is gone', async () => {
    const { token } = await expiredToken();
    const month = await purchase(token, 'month');
    const year = await purchase(token, 'year');
    expect(year.checkoutUrl).not.toBe(month.checkoutUrl);

    // The year expires at Mollie unpaid, and the page notices on its next load.
    payments.get(paymentIdOf(year.checkoutUrl))!.status = 'expired';
    await confirmTokenPayment(token);

    // The month set aside is still open: it is continued, not created again.
    expect(await purchase(token, 'month')).toEqual(month);
    expect(payments.size).toBe(2);
    expect((await findTokenByValue(token))).toMatchObject({
      openPaymentId: paymentIdOf(month.checkoutUrl),
      parkedPaymentId: null,
    });
  });

  it('continues the payment set aside once a method was picked for it', async () => {
    const { token } = await expiredToken();
    const month = await purchase(token, 'month');
    const year = await purchase(token, 'year');

    // From the browser history the visitor tried the month with PayPal, and
    // the attempt failed: that one may still go through, so it is continued
    // rather than replaced — at the checkout kept from its creation, which
    // Mollie no longer hands out.
    failAttempt(paymentIdOf(month.checkoutUrl));

    expect(await purchase(token, 'month')).toEqual(month);
    expect(payments.size).toBe(2);
    expect((await findTokenByValue(token))).toMatchObject({
      openPaymentId: paymentIdOf(month.checkoutUrl),
      parkedPaymentId: paymentIdOf(year.checkoutUrl),
    });
  });

  it('waits for the payment set aside once it is being processed, and starts nothing beside it', async () => {
    const { token } = await expiredToken();
    const month = await purchase(token, 'month');
    await purchase(token, 'year');

    // Paid from the browser history: the month is being processed while the
    // year, which replaced it, still waits for a method at Mollie.
    const payment = payments.get(paymentIdOf(month.checkoutUrl))!;
    Object.assign(payment, { status: 'pending', method: 'paypal' });
    delete payment._links.checkout;

    expect(await confirmTokenPayment(token)).toMatchObject({ status: 'pending', wait: true });
    const { openPayment } = await getPurchaseOffer((await findTokenByValue(token))!);
    expect(openPayment).toMatchObject({ period: 'month', status: 'pending', replaceable: false });
    // Neither period starts a second payment: the visitor could end up paying twice.
    await expect(purchase(token, 'year')).rejects.toBeInstanceOf(PaymentInProgressError);
    await expect(purchase(token, 'month')).rejects.toBeInstanceOf(PaymentInProgressError);
    expect(payments.size).toBe(2);
  });

  it('cancels the bank transfer set aside, not the open payment beside it', async () => {
    const { token } = await expiredToken();
    const month = await purchase(token, 'month');
    const year = await purchase(token, 'year');

    // From the browser history the visitor chose a bank transfer for the month.
    const monthId = paymentIdOf(month.checkoutUrl);
    Object.assign(payments.get(monthId)!, { method: 'banktransfer', isCancelable: true });

    expect(await confirmTokenPayment(token)).toMatchObject({ status: 'transfer' });
    const { openPayment } = await getPurchaseOffer((await findTokenByValue(token))!);
    expect(openPayment).toMatchObject({ period: 'month', status: 'transfer', cancelable: true });

    await cancelOpenPayment(token);
    expect(payments.get(monthId)!.status).toBe('canceled');
    expect((await findTokenByValue(token))).toMatchObject({
      openPaymentId: paymentIdOf(year.checkoutUrl),
      parkedPaymentId: null,
    });
  });

  it('applies a payment set aside that was paid after all, as soon as the page loads', async () => {
    const { token } = await expiredToken();
    const month = await purchase(token, 'month');
    await purchase(token, 'year');

    markPaid(paymentIdOf(month.checkoutUrl));
    const check = await confirmTokenPayment(token);

    expect(check.status).toBe('paid');
    expect(hasTokenPurchase(paymentIdOf(month.checkoutUrl))).toBe(true);
    expect((await findTokenByValue(token))?.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    // Renewed: nothing is left to buy, and the year must not be started again.
    expect((await getPurchaseOffer((await findTokenByValue(token))!)).options).toEqual([]);
    await expect(purchase(token, 'year')).rejects.toBeInstanceOf(PurchaseUnavailableError);
  });
});

describe('when the money goes back', () => {
  it('tells the admin about a chargeback even when a later purchase replaced the one it hits', async () => {
    const { id: tokenId, token, mediaId } = await expiredToken();
    const metadata = { token, tokenId, target: 'media', targetId: mediaId, period: 'month', adminUrl: 'https://app.example/media/x' };
    const amount = { currency: 'EUR', value: '9.00' };
    payments.set('tr_old', {
      id: 'tr_old',
      status: 'paid',
      method: 'creditcard',
      amount,
      amountChargedBack: amount,
      createdAt: '2026-03-15T12:00:00Z',
      description: 'Video – 1 month access',
      metadata,
      _links: { dashboard: { href: 'https://dashboard.example/tr_old' } },
    });
    const paid = { amount: 900, currency: 'EUR', dashboardUrl: null };
    applyTokenPurchase({ tokenId, paymentId: 'tr_old', period: 'month', now: new Date('2026-03-15T12:00:00Z'), ...paid });
    // The month ran out and the visitor bought a year. Then the month's money
    // went back: the year stands, and the admin still learns of it.
    applyTokenPurchase({ tokenId, paymentId: 'tr_new', period: 'year', now: new Date('2026-05-01T12:00:00Z'), ...paid });

    await confirmPayment('tr_old');

    expect(await listOpenPaymentNotices()).toMatchObject([{ paymentId: 'tr_old', kind: 'reverted' }]);
    expect((await findTokenByValue(token))?.expiresAt).toEqual(new Date('2027-05-01T12:00:00Z'));
  });
});

describe('waiting for a payment being processed', () => {
  it('counts the wait from when the payment was first seen pending, not from its creation', async () => {
    const start = new Date('2026-06-01T12:00:00Z');
    vi.useFakeTimers({ now: start });
    const { token } = await expiredToken();
    const { checkoutUrl } = await purchase(token, 'month');
    // A PayPal checkout stays open for hours; the visitor paid an hour after
    // clicking the price, and Mollie is now processing it.
    const payment = payments.get(paymentIdOf(checkoutUrl))!;
    Object.assign(payment, {
      status: 'pending',
      method: 'paypal',
      createdAt: new Date(start.getTime() - 60 * 60 * 1000).toISOString(),
    });
    delete payment._links.checkout;

    expect(await confirmTokenPayment(token)).toMatchObject({ status: 'pending', wait: true });

    // A quarter of an hour later it is still processing: no page waits for it any more.
    vi.setSystemTime(new Date(start.getTime() + 16 * 60 * 1000));
    expect(await confirmTokenPayment(token)).toMatchObject({ status: 'pending', wait: false });
  });
});
