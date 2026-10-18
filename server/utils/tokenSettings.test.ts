import { describe, expect, it } from 'vitest';
import { parseTokenSettingsChanges } from './tokenSettings';

describe('parseTokenSettingsChanges', () => {
  it('changes nothing that was not sent', () => {
    expect(parseTokenSettingsChanges({})).toEqual({});
    expect(parseTokenSettingsChanges(undefined)).toEqual({});
  });

  it('takes a usage limit, and `null` to lift it', () => {
    expect(parseTokenSettingsChanges({ usageLimit: 3 })).toEqual({ usageLimit: 3 });
    expect(parseTokenSettingsChanges({ usageLimit: null })).toEqual({ usageLimit: null });
  });

  it('turns down a usage limit that is not a positive whole number', () => {
    expect(parseTokenSettingsChanges({ usageLimit: 0 })).toBeNull();
    expect(parseTokenSettingsChanges({ usageLimit: 1.5 })).toBeNull();
    expect(parseTokenSettingsChanges({ usageLimit: '3' })).toBeNull();
  });

  it('takes a fixed expiry date as an instant, and `null` to lift it', () => {
    const expiresAt = '2027-06-01T10:00:00.000Z';
    expect(parseTokenSettingsChanges({ expiresAt })).toEqual({
      validity: { expiresAt: new Date(expiresAt), validFor: null },
    });
    expect(parseTokenSettingsChanges({ expiresAt: null })).toEqual({
      validity: { expiresAt: null, validFor: null },
    });
  });

  it('turns down an expiry date that is not a date', () => {
    expect(parseTokenSettingsChanges({ expiresAt: 'soon' })).toBeNull();
  });

  it('takes a first-use duration, which clears the expiry date', () => {
    expect(parseTokenSettingsChanges({ validFor: { weeks: 2 } })).toEqual({
      validity: { expiresAt: null, validFor: { weeks: 2 } },
    });
  });

  it('turns down a malformed duration or one sent together with a date', () => {
    expect(parseTokenSettingsChanges({ validFor: { fortnights: 1 } })).toBeNull();
    expect(parseTokenSettingsChanges({ validFor: { days: 7 }, expiresAt: '2027-06-01T10:00:00.000Z' })).toBeNull();
  });
});
