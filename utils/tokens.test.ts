import { describe, expect, it } from 'vitest';
import { groupMatchingTokensByBatch } from './tokens';

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
