/** How long a purchase extends a token for. */
export const PURCHASE_PERIODS = ['month', 'year'] as const;
export type PurchasePeriod = typeof PURCHASE_PERIODS[number];

export function isPurchasePeriod(value: unknown): value is PurchasePeriod {
  return PURCHASE_PERIODS.includes(value as PurchasePeriod);
}

/** Prices of a media or group, in minor units; `null` means "not for sale". */
export interface PurchasePrices {
  priceMonth: number | null
  priceYear: number | null
}

export interface PurchaseOption {
  period: PurchasePeriod
  /** In the currency's minor unit, formatted by the page. */
  amount: number
  currency: string
}

/**
 * What a visitor may buy. A price of zero is left out along with a missing
 * one: Mollie refuses a zero amount, and free access is what a new token is for.
 */
export function getPurchaseOptions(prices: PurchasePrices, currency: string): PurchaseOption[] {
  const amounts: Record<PurchasePeriod, number | null> = {
    month: prices.priceMonth,
    year: prices.priceYear,
  };
  return PURCHASE_PERIODS
    .filter(period => (amounts[period] ?? 0) > 0)
    .map(period => ({ period, amount: amounts[period]!, currency }));
}

/**
 * The token's new end after a purchase. Buying while the old window is still
 * open adds on top of it, so nobody loses days by paying early; a lapsed or
 * undated token starts its period now. Calendar months, so a month bought on
 * 31 January ends with February.
 */
export function extendExpiry(expiresAt: Date | null, period: PurchasePeriod, now: Date = new Date()): Date {
  const base = expiresAt && expiresAt > now ? expiresAt : now;
  return addUtcMonths(base, period === 'month' ? 1 : 12);
}

/**
 * Counted in UTC so a daylight-saving switch in the server's timezone cannot
 * move a paid period by an hour. A day the target month lacks becomes its last.
 */
function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * What the app puts into a Mollie payment. It is read back from Mollie — never
 * from the request — to decide which token a paid payment extends, and it is
 * what shows up in the Mollie dashboard for internal analysis.
 */
export interface PurchaseMetadata {
  /** The access link's token, which the admin token filter finds. */
  token: string
  tokenId: string
  target: 'media' | 'group'
  targetId: string
  period: PurchasePeriod
  /** Straight from the payment to the media or group in the admin UI. */
  adminUrl: string
}

/** `null` for metadata this app did not write, e.g. another shop on the same account. */
export function parsePurchaseMetadata(value: unknown): PurchaseMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const strings = ['token', 'tokenId', 'targetId', 'adminUrl'] as const;
  if (strings.some(key => typeof data[key] !== 'string' || !data[key])) {
    return null;
  }
  if ((data.target !== 'media' && data.target !== 'group') || !isPurchasePeriod(data.period)) {
    return null;
  }
  return {
    token: data.token as string,
    tokenId: data.tokenId as string,
    target: data.target,
    targetId: data.targetId as string,
    period: data.period,
    adminUrl: data.adminUrl as string,
  };
}

/**
 * The customer sees this on Mollie's checkout and, where the payment method
 * carries it, on their bank statement — so it names what they paid for. Kept
 * on the server in a small table rather than in the app's translations: it is
 * the only server-side text, and the page is gone by the time it is shown.
 */
const PERIOD_DESCRIPTIONS: Record<string, Record<PurchasePeriod, string>> = {
  en: { month: '1 month access', year: '1 year access' },
  de: { month: 'Zugang für 1 Monat', year: 'Zugang für 1 Jahr' },
};

const MOLLIE_DESCRIPTION_MAX_LENGTH = 255;

export function buildPaymentDescription(title: string, period: PurchasePeriod, locale: string): string {
  const suffix = ` – ${(PERIOD_DESCRIPTIONS[locale] ?? PERIOD_DESCRIPTIONS.en!)[period]}`;
  const room = MOLLIE_DESCRIPTION_MAX_LENGTH - suffix.length;
  const name = title.length > room ? `${title.slice(0, room - 1)}…` : title;
  return `${name}${suffix}`;
}

const MOLLIE_LOCALES: Record<string, string> = {
  en: 'en_US',
  de: 'de_DE',
};

/** Mollie's checkout language for the app's, `undefined` to let Mollie pick. */
export function toMollieLocale(locale: string): string | undefined {
  return MOLLIE_LOCALES[locale];
}

/**
 * Mollie's statuses as far as a visitor is concerned: the money arrived, it is
 * being processed and arrives in a moment (`pending`), a bank transfer is on
 * its way and takes days (`transfer`), the checkout was left without paying
 * (`open`), or this payment is over without it.
 */
export type PurchaseStatus = 'paid' | 'pending' | 'transfer' | 'open' | 'failed';

/**
 * `open` is what a visitor coming back from Mollie's "back" link brings: the
 * payment lives on at Mollie for a while, but nothing is on its way — except
 * for a bank transfer, which stays open until the money arrives.
 */
export function classifyPaymentStatus(status: string, method: string | null): PurchaseStatus {
  if (status === 'paid') {
    return 'paid';
  }
  if (status === 'open') {
    return method === 'banktransfer' ? 'transfer' : 'open';
  }
  return ['pending', 'authorized'].includes(status) ? 'pending' : 'failed';
}
