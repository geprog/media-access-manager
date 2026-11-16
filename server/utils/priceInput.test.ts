import { describe, expect, it } from 'vitest';
import { readPriceUpdate } from './priceInput';

describe('readPriceUpdate', () => {
  it('takes prices in minor units', () => {
    expect(readPriceUpdate({ priceMonth: 900, priceYear: 4900 })).toEqual({ priceMonth: 900, priceYear: 4900 });
  });

  it('takes `null` as "not for sale" and leaves out what was not sent', () => {
    expect(readPriceUpdate({ priceMonth: null })).toEqual({ priceMonth: null, priceYear: undefined });
    expect(readPriceUpdate({})).toEqual({ priceMonth: undefined, priceYear: undefined });
  });

  it('refuses anything that is not a whole, non-negative amount', () => {
    expect(readPriceUpdate({ priceMonth: 9.99 })).toBeNull();
    expect(readPriceUpdate({ priceMonth: -100 })).toBeNull();
    expect(readPriceUpdate({ priceYear: '900' })).toBeNull();
    expect(readPriceUpdate({ priceYear: Number.POSITIVE_INFINITY })).toBeNull();
    expect(readPriceUpdate(null)).toBeNull();
  });
});
