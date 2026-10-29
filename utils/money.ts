/**
 * Prices are kept in the currency's minor unit (cents for EUR) everywhere they
 * are stored or sent around, so no rounding ever happens on the way. Only the
 * admin input and the visitor's display deal in whole currency amounts.
 */

/** Decimals the currency is written with: 2 for EUR, 0 for JPY. */
export function currencyFractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency })
    .resolvedOptions()
    .maximumFractionDigits ?? 2;
}

/** The `amount` object Mollie expects, e.g. `{ currency: 'EUR', value: '9.00' }`. */
export function toMollieAmount(minorUnits: number, currency: string) {
  const digits = currencyFractionDigits(currency);
  return { currency, value: (minorUnits / 10 ** digits).toFixed(digits) };
}

/** An entered price such as `9.99` in minor units, rounded off float drift. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyFractionDigits(currency));
}

export function fromMinorUnits(minorUnits: number, currency: string): number {
  return minorUnits / 10 ** currencyFractionDigits(currency);
}

export function formatPrice(minorUnits: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(fromMinorUnits(minorUnits, currency));
}
