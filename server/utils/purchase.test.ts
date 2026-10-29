import { describe, expect, it } from 'vitest';
import {
  buildPaymentDescription,
  classifyPaymentStatus,
  getPurchaseOptions,
  isPaymentRecent,
  isPurchasePeriod,
  parsePurchaseMetadata,
  purchaseExpiry,
  toMollieLocale,
} from './purchase';

describe('getPurchaseOptions', () => {
  it('offers every period that has a price', () => {
    expect(getPurchaseOptions({ priceMonth: 900, priceYear: 4900 }, 'EUR')).toEqual([
      { period: 'month', amount: 900, currency: 'EUR' },
      { period: 'year', amount: 4900, currency: 'EUR' },
    ]);
  });

  it('leaves out a period without price', () => {
    expect(getPurchaseOptions({ priceMonth: null, priceYear: 4900 }, 'EUR')).toEqual([
      { period: 'year', amount: 4900, currency: 'EUR' },
    ]);
  });

  it('offers nothing for free or unpriced content', () => {
    expect(getPurchaseOptions({ priceMonth: null, priceYear: null }, 'EUR')).toEqual([]);
    // Mollie refuses a zero amount, and handing access out for free is what
    // a new token is for.
    expect(getPurchaseOptions({ priceMonth: 0, priceYear: 0 }, 'EUR')).toEqual([]);
  });
});

describe('purchaseExpiry', () => {
  const now = new Date('2026-03-10T12:00:00Z');

  it('counts the paid period from the purchase', () => {
    expect(purchaseExpiry('month', now)).toEqual(new Date('2026-04-10T12:00:00Z'));
    expect(purchaseExpiry('year', now)).toEqual(new Date('2027-03-10T12:00:00Z'));
  });

  it('ends a month bought on the 31st at the end of a shorter month', () => {
    const endOfJanuary = new Date('2026-01-31T12:00:00Z');
    expect(purchaseExpiry('month', endOfJanuary)).toEqual(new Date('2026-02-28T12:00:00Z'));
  });

  it('ends a year bought on a leap day on 28 February', () => {
    const leapDay = new Date('2028-02-29T12:00:00Z');
    expect(purchaseExpiry('year', leapDay)).toEqual(new Date('2029-02-28T12:00:00Z'));
  });
});

describe('isPaymentRecent', () => {
  const now = new Date('2026-03-10T12:00:00Z');

  it('holds the page back for a payment started minutes ago', () => {
    expect(isPaymentRecent('2026-03-10T11:50:00Z', now)).toBe(true);
  });

  it('does not for one started long ago, or with no usable date', () => {
    expect(isPaymentRecent('2026-03-10T11:30:00Z', now)).toBe(false);
    expect(isPaymentRecent('not a date', now)).toBe(false);
  });
});

describe('isPurchasePeriod', () => {
  it('accepts only the periods on offer', () => {
    expect(isPurchasePeriod('month')).toBe(true);
    expect(isPurchasePeriod('year')).toBe(true);
    expect(isPurchasePeriod('week')).toBe(false);
    expect(isPurchasePeriod(undefined)).toBe(false);
  });
});

describe('parsePurchaseMetadata', () => {
  const valid = {
    token: 'abc',
    tokenId: 't1',
    target: 'media',
    targetId: 'm1',
    period: 'year',
    adminUrl: 'https://example.com/media/m1',
  };

  it('reads back what the app put into a payment', () => {
    expect(parsePurchaseMetadata(valid)).toEqual(valid);
  });

  it('refuses metadata another integration wrote', () => {
    expect(parsePurchaseMetadata(null)).toBeNull();
    expect(parsePurchaseMetadata('order-42')).toBeNull();
    expect(parsePurchaseMetadata({ ...valid, period: 'week' })).toBeNull();
    expect(parsePurchaseMetadata({ ...valid, tokenId: undefined })).toBeNull();
  });
});

describe('buildPaymentDescription', () => {
  it('names what was bought in the visitor\'s language', () => {
    expect(buildPaymentDescription('Yoga Basics', 'month', 'en')).toBe('Yoga Basics – 1 month access');
    expect(buildPaymentDescription('Yoga Basics', 'year', 'de')).toBe('Yoga Basics – Zugang für 1 Jahr');
  });

  it('falls back to English for an unknown language', () => {
    expect(buildPaymentDescription('Yoga', 'year', 'fr')).toBe('Yoga – 1 year access');
  });

  it('stays within Mollie\'s 255 characters', () => {
    const description = buildPaymentDescription('x'.repeat(300), 'year', 'en');
    expect(description.length).toBeLessThanOrEqual(255);
    expect(description.endsWith('– 1 year access')).toBe(true);
  });
});

describe('toMollieLocale', () => {
  it('maps the app\'s languages to Mollie checkout locales', () => {
    expect(toMollieLocale('de')).toBe('de_DE');
    expect(toMollieLocale('en')).toBe('en_US');
    expect(toMollieLocale('xx')).toBeUndefined();
  });
});

describe('classifyPaymentStatus', () => {
  it('groups Mollie\'s statuses into what the visitor needs to know', () => {
    expect(classifyPaymentStatus('paid', 'paypal')).toBe('paid');
    expect(classifyPaymentStatus('pending', 'creditcard')).toBe('pending');
    expect(classifyPaymentStatus('authorized', 'creditcard')).toBe('pending');
    expect(classifyPaymentStatus('canceled', 'paypal')).toBe('failed');
    expect(classifyPaymentStatus('expired', null)).toBe('failed');
    expect(classifyPaymentStatus('failed', 'creditcard')).toBe('failed');
  });

  it('tells a checkout left without paying apart from money still on its way', () => {
    // Leaving Mollie's checkout via "back" keeps the payment open, with or
    // without a method picked.
    expect(classifyPaymentStatus('open', null)).toBe('open');
    expect(classifyPaymentStatus('open', 'paypal')).toBe('open');
    // A bank transfer stays open until the money arrives, days later — not
    // something to wait for on the page, unlike a payment being processed.
    expect(classifyPaymentStatus('open', 'banktransfer')).toBe('transfer');
  });
});
