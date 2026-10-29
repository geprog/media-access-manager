import { describe, expect, it } from 'vitest';
import { formatPrice, fromMinorUnits, toMinorUnits, toMollieAmount } from './money';

describe('toMollieAmount', () => {
  it('writes cents as a string with two decimals', () => {
    expect(toMollieAmount(900, 'EUR')).toEqual({ currency: 'EUR', value: '9.00' });
    expect(toMollieAmount(4999, 'EUR')).toEqual({ currency: 'EUR', value: '49.99' });
  });

  it('keeps currencies without minor unit whole', () => {
    expect(toMollieAmount(500, 'JPY')).toEqual({ currency: 'JPY', value: '500' });
  });
});

describe('toMinorUnits', () => {
  it('turns an entered price into cents without float drift', () => {
    expect(toMinorUnits(9.99, 'EUR')).toBe(999);
    expect(toMinorUnits(0.29, 'EUR')).toBe(29);
    expect(toMinorUnits(19.9, 'EUR')).toBe(1990);
  });

  it('respects currencies without minor unit', () => {
    expect(toMinorUnits(500, 'JPY')).toBe(500);
  });
});

describe('fromMinorUnits', () => {
  it('turns cents back into the price an admin entered', () => {
    expect(fromMinorUnits(999, 'EUR')).toBe(9.99);
    expect(fromMinorUnits(500, 'JPY')).toBe(500);
  });
});

describe('formatPrice', () => {
  it('formats in the visitor\'s locale', () => {
    expect(formatPrice(4999, 'EUR', 'en')).toBe('€49.99');
    // `Intl` separates amount and symbol with a no-break space in German.
    expect(formatPrice(4999, 'EUR', 'de')).toBe('49,99 €');
  });
});
