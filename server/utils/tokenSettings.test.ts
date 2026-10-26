import { describe, expect, it } from 'vitest';
import { getTokenSettingsColumns, parseTokenSettingsChanges } from './tokenSettings';

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

  it('turns down an expiry date that is not sent as a string', () => {
    expect(parseTokenSettingsChanges({ expiresAt: true })).toBeNull();
    expect(parseTokenSettingsChanges({ expiresAt: 1780000000000 })).toBeNull();
    expect(parseTokenSettingsChanges({ expiresAt: 0 })).toBeNull();
    expect(parseTokenSettingsChanges({ expiresAt: '' })).toBeNull();
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

describe('getTokenSettingsColumns', () => {
  const unopened = { firstUsedAt: null };
  const opened = { firstUsedAt: new Date('2027-01-01T10:00:00.000Z') };

  it('touches no column for no changes', () => {
    expect(getTokenSettingsColumns(unopened, {})).toEqual({});
  });

  it('sets the usage limit, and lifts it with `null`', () => {
    expect(getTokenSettingsColumns(unopened, { usageLimit: 5 })).toEqual({ usageLimit: 5 });
    expect(getTokenSettingsColumns(unopened, { usageLimit: null })).toEqual({ usageLimit: null });
  });

  it('replaces a first-use duration with a fixed expiry date', () => {
    const expiresAt = new Date('2027-06-01T10:00:00.000Z');
    expect(getTokenSettingsColumns(opened, { validity: { expiresAt, validFor: null } }))
      .toEqual({ expiresAt, validFor: null });
  });

  it('leaves the expiry of a token not yet opened to its first use', () => {
    expect(getTokenSettingsColumns(unopened, { validity: { expiresAt: null, validFor: { days: 14 } } }))
      .toEqual({ expiresAt: null, validFor: { days: 14 } });
  });

  it('counts a new duration from the first use of a token already opened', () => {
    expect(getTokenSettingsColumns(opened, { usageLimit: 3, validity: { expiresAt: null, validFor: { days: 14 } } }))
      .toEqual({ usageLimit: 3, expiresAt: new Date('2027-01-15T10:00:00.000Z'), validFor: { days: 14 } });
  });
});
