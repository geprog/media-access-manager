import type { TokenRow } from './tokens';
import { describe, expect, it } from 'vitest';
import { getBatchSettings, getUsageLimitConflicts, getValidityConflicts, groupMatchingTokensByBatch } from './tokens';

function token(value: string, batchId: string | null) {
  return { token: value, batchId };
}

describe('groupMatchingTokensByBatch', () => {
  it('groups every token by its batch when nothing is searched for', () => {
    const grouped = groupMatchingTokensByBatch(
      [token('aaa', 'batch-1'), token('bbb', 'batch-2'), token('ccc', 'batch-1')],
      '',
    );

    expect([...grouped.keys()]).toEqual(['batch-1', 'batch-2']);
    expect(grouped.get('batch-1')).toEqual([token('aaa', 'batch-1'), token('ccc', 'batch-1')]);
    expect(grouped.get('batch-2')).toEqual([token('bbb', 'batch-2')]);
  });

  it('keeps only the matching tokens, across all batches', () => {
    const grouped = groupMatchingTokensByBatch(
      [token('abc123', 'batch-1'), token('def456', 'batch-1'), token('xyz123', 'batch-2')],
      '123',
    );

    expect(grouped.get('batch-1')).toEqual([token('abc123', 'batch-1')]);
    expect(grouped.get('batch-2')).toEqual([token('xyz123', 'batch-2')]);
  });

  it('drops batches without a match so they can stay collapsed', () => {
    const grouped = groupMatchingTokensByBatch(
      [token('abc', 'batch-1'), token('xyz', 'batch-2')],
      'abc',
    );

    expect([...grouped.keys()]).toEqual(['batch-1']);
  });

  it('ignores case and surrounding whitespace', () => {
    const grouped = groupMatchingTokensByBatch([token('AbCdEf', 'batch-1')], '  cDe  ');

    expect(grouped.get('batch-1')).toEqual([token('AbCdEf', 'batch-1')]);
  });

  it('leaves out tokens that belong to no batch', () => {
    const grouped = groupMatchingTokensByBatch([token('abc', null), token('abd', 'batch-1')], 'ab');

    expect([...grouped.keys()]).toEqual(['batch-1']);
    expect(grouped.get('batch-1')).toEqual([token('abd', 'batch-1')]);
  });

  it('matches nothing when the search is only whitespace apart from being empty', () => {
    const grouped = groupMatchingTokensByBatch([token('abc', 'batch-1')], '   ');

    expect(grouped.get('batch-1')).toEqual([token('abc', 'batch-1')]);
  });
});

function row(overrides: Partial<TokenRow>): TokenRow {
  return {
    id: 'token-1',
    token: 'abc',
    name: '1',
    usageCount: 0,
    usageLimit: null,
    expiresAt: null,
    validFor: null,
    firstUsedAt: null,
    batchId: 'batch-1',
    ...overrides,
  };
}

describe('getBatchSettings', () => {
  const SHARED = { usageLimit: false, validity: false };

  it('reads a fixed expiry date and the usage limit off the batch', () => {
    const expiresAt = '2027-06-01T10:00:00.000Z';
    expect(getBatchSettings([row({ usageLimit: 3, expiresAt }), row({ usageLimit: 3, expiresAt })]))
      .toEqual({ usageLimit: 3, expiresAt, validFor: null, differing: SHARED });
  });

  it('reports the first-use duration rather than the expiry of a token already opened', () => {
    const tokens = [
      row({ validFor: { days: 7 }, expiresAt: '2027-01-07T10:00:00.000Z' }),
      row({ validFor: { days: 7 } }),
    ];
    expect(getBatchSettings(tokens))
      .toEqual({ usageLimit: null, expiresAt: null, validFor: { days: 7 }, differing: SHARED });
  });

  it('leaves out a usage limit the tokens do not share', () => {
    const expiresAt = '2027-06-01T10:00:00.000Z';
    const tokens = [row({ usageLimit: 10, expiresAt }), row({ usageLimit: 3, expiresAt }), row({ usageLimit: 3, expiresAt })];
    expect(getBatchSettings(tokens))
      .toEqual({ usageLimit: null, expiresAt, validFor: null, differing: { usageLimit: true, validity: false } });
  });

  it('tells a lifted limit on one token apart from a shared one', () => {
    const tokens = [row({ usageLimit: null }), row({ usageLimit: 3 })];
    expect(getBatchSettings(tokens).differing.usageLimit).toBe(true);
  });

  it('leaves out a validity the tokens do not share', () => {
    const tokens = [
      row({ usageLimit: 3, expiresAt: '2027-06-01T10:00:00.000Z' }),
      row({ usageLimit: 3, validFor: { days: 7 } }),
    ];
    expect(getBatchSettings(tokens))
      .toEqual({ usageLimit: 3, expiresAt: null, validFor: null, differing: { usageLimit: false, validity: true } });
  });

  it('finds different fixed expiry dates and different durations', () => {
    expect(getBatchSettings([row({ expiresAt: '2027-06-01T10:00:00.000Z' }), row({ expiresAt: null })]).differing.validity)
      .toBe(true);
    expect(getBatchSettings([row({ validFor: { days: 7 } }), row({ validFor: { weeks: 1 } })]).differing.validity)
      .toBe(true);
  });

  it('has nothing to report for a batch without tokens', () => {
    expect(getBatchSettings([])).toEqual({ usageLimit: null, expiresAt: null, validFor: null, differing: SHARED });
  });
});

describe('getValidityConflicts', () => {
  const now = new Date('2027-01-10T12:00:00.000Z');

  /** Opened on 1 January for two weeks, so still running on the 10th. */
  const running = row({ validFor: { days: 14 }, firstUsedAt: '2027-01-01T12:00:00.000Z', expiresAt: '2027-01-15T12:00:00.000Z' });
  const waiting = row({ validFor: { days: 14 } });

  it('finds nothing when the change leaves every token usable', () => {
    expect(getValidityConflicts([waiting, running], { expiresAt: null, validFor: { days: 30 } }, now))
      .toEqual({ closed: 0, replaced: 0 });
  });

  it('counts open tokens a shorter first-use duration would close at once', () => {
    expect(getValidityConflicts([waiting, running], { expiresAt: null, validFor: { days: 7 } }, now))
      .toEqual({ closed: 1, replaced: 0 });
  });

  it('counts open tokens a fixed date in the past would close at once', () => {
    const tokens = [row({ expiresAt: '2027-02-01T00:00:00.000Z' }), row({})];
    expect(getValidityConflicts(tokens, { expiresAt: new Date('2027-01-01T00:00:00.000Z'), validFor: null }, now))
      .toEqual({ closed: 2, replaced: 0 });
  });

  it('does not count tokens that had already expired', () => {
    const tokens = [row({ expiresAt: '2027-01-05T00:00:00.000Z' })];
    expect(getValidityConflicts(tokens, { expiresAt: new Date('2027-01-01T00:00:00.000Z'), validFor: null }, now))
      .toEqual({ closed: 0, replaced: 0 });
  });

  it('counts running first-use tokens whose own expiry a fixed date would replace', () => {
    expect(getValidityConflicts([waiting, running], { expiresAt: new Date('2027-06-01T00:00:00.000Z'), validFor: null }, now))
      .toEqual({ closed: 0, replaced: 1 });
    expect(getValidityConflicts([waiting, running], { expiresAt: null, validFor: null }, now))
      .toEqual({ closed: 0, replaced: 1 });
  });
});

describe('getUsageLimitConflicts', () => {
  it('counts tokens a lower limit would use up at once', () => {
    const tokens = [row({ usageLimit: 5, usageCount: 3 }), row({ usageLimit: 5, usageCount: 1 })];
    expect(getUsageLimitConflicts(tokens, 2)).toBe(1);
  });

  it('counts a token used exactly as often as the new limit allows', () => {
    expect(getUsageLimitConflicts([row({ usageLimit: null, usageCount: 2 })], 2)).toBe(1);
  });

  it('does not count tokens already used up before', () => {
    expect(getUsageLimitConflicts([row({ usageLimit: 2, usageCount: 2 })], 1)).toBe(0);
  });

  it('finds nothing when the limit is lifted', () => {
    expect(getUsageLimitConflicts([row({ usageLimit: 2, usageCount: 1 })], null)).toBe(0);
  });

  // A group token's limit applies to each media alone, so its total says
  // nothing; what counts is the media it was watched most.
  it('reads a group token by the media it watched most', () => {
    const tokens = [
      row({ usageLimit: 5, usageCount: 6, maxMediaUsageCount: 2 }),
      row({ usageLimit: 5, usageCount: 4, maxMediaUsageCount: 4 }),
    ];
    expect(getUsageLimitConflicts(tokens, 3)).toBe(1);
  });
});
