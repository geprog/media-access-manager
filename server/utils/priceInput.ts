import type { PurchasePrices } from './purchase';

export type PriceUpdate = { [Key in keyof PurchasePrices]?: PurchasePrices[Key] };

/** A price is a whole amount of minor units, or `null` for "not for sale". */
function isPrice(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

/**
 * The prices of a media or group update, `null` when the body holds anything
 * but whole, non-negative amounts. A field left out stays as it is.
 */
export function readPriceUpdate(body: unknown): PriceUpdate | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const { priceMonth, priceYear } = body as Record<string, unknown>;
  if ((priceMonth !== undefined && !isPrice(priceMonth)) || (priceYear !== undefined && !isPrice(priceYear))) {
    return null;
  }
  return { priceMonth, priceYear } as PriceUpdate;
}
