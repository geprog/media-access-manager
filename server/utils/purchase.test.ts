import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPaymentDescription,
  classifyPaymentStatus,
  describePurchasePeriod,
  getPurchaseOptions,
  isPaymentRecent,
  isPaymentReversed,
  isPaymentUnattempted,
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

describe('isPaymentReversed', () => {
  const amount = { currency: 'EUR', value: '49.00' };

  it('is false while the money stays', () => {
    expect(isPaymentReversed({ amount })).toBe(false);
    // A partial refund is a goodwill gesture, not a reversal.
    expect(isPaymentReversed({ amount, amountRefunded: { value: '10.00' } })).toBe(false);
  });

  it('is true once the money went back in full, by refund, chargeback or both', () => {
    expect(isPaymentReversed({ amount, amountRefunded: { value: '49.00' } })).toBe(true);
    expect(isPaymentReversed({ amount, amountChargedBack: { value: '49.00' } })).toBe(true);
    expect(isPaymentReversed({ amount, amountRefunded: { value: '20.00' }, amountChargedBack: { value: '29.00' } })).toBe(true);
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

describe('describePurchasePeriod', () => {
  const en = { purchase_payment_description_month: '1 month access', purchase_payment_description_year: '1 year access' };
  const de = { purchase_payment_description_year: 'Zugang für 1 Jahr' };

  it('names the period in the visitor\'s language', () => {
    expect(describePurchasePeriod('year', de, en)).toBe('Zugang für 1 Jahr');
  });

  it('falls back where the language lacks the text, or the app the language', () => {
    expect(describePurchasePeriod('month', de, en)).toBe('1 month access');
    expect(describePurchasePeriod('year', null, en)).toBe('1 year access');
  });

  it('takes the text from the app\'s own translation files', () => {
    for (const locale of ['en', 'de']) {
      const messages = JSON.parse(readFileSync(path.resolve(process.cwd(), 'i18n', 'locales', `${locale}.json`), 'utf8'));
      expect(describePurchasePeriod('month', messages, null)).not.toBe('month');
      expect(describePurchasePeriod('year', messages, null)).not.toBe('year');
    }
  });
});

describe('buildPaymentDescription', () => {
  it('names what was bought', () => {
    expect(buildPaymentDescription('Yoga Basics', '1 month access')).toBe('Yoga Basics – 1 month access');
  });

  it('stays within Mollie\'s 255 characters', () => {
    const description = buildPaymentDescription('x'.repeat(300), '1 year access');
    expect(description.length).toBeLessThanOrEqual(255);
    expect(description.endsWith('– 1 year access')).toBe(true);
  });
});

describe('toMollieLocale', () => {
  it('maps the app\'s languages to Mollie checkout locales', () => {
    expect(toMollieLocale('de')).toBe('de_DE');
    expect(toMollieLocale('en')).toBe('en_US');
    expect(toMollieLocale('xx')).toBeUndefined();
    expect(toMollieLocale('__proto__')).toBeUndefined();
    expect(toMollieLocale('toString')).toBeUndefined();
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

describe('isPaymentUnattempted', () => {
  it('is true while the visitor picked no method at Mollie', () => {
    // Nothing but the method picker was shown: no money can be on its way.
    expect(isPaymentUnattempted('open', null)).toBe(true);
  });

  it('is false once the visitor picked a method', () => {
    // A failed card attempt leaves the payment open, and the attempt may yet
    // go through: a second payment could have them pay twice.
    expect(isPaymentUnattempted('open', 'creditcard')).toBe(false);
    expect(isPaymentUnattempted('transfer', 'banktransfer')).toBe(false);
  });

  it('is false for a payment that is no longer the visitor\'s to redirect', () => {
    expect(isPaymentUnattempted('pending', null)).toBe(false);
    expect(isPaymentUnattempted('paid', 'creditcard')).toBe(false);
    expect(isPaymentUnattempted('failed', null)).toBe(false);
  });
});
