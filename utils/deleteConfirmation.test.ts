import { describe, expect, it } from 'vitest';
import { matchesDeleteConfirmation } from './deleteConfirmation';

describe('matchesDeleteConfirmation', () => {
  it('accepts exactly the expected text, ignoring surrounding spaces', () => {
    expect(matchesDeleteConfirmation('Workshop 2025', 'Workshop 2025')).toBe(true);
    expect(matchesDeleteConfirmation('  Workshop 2025 ', 'Workshop 2025')).toBe(true);
  });

  it('turns down anything else, including a different case', () => {
    expect(matchesDeleteConfirmation('Workshop', 'Workshop 2025')).toBe(false);
    expect(matchesDeleteConfirmation('workshop 2025', 'Workshop 2025')).toBe(false);
  });

  it('never accepts an empty input, even when there is nothing to type', () => {
    expect(matchesDeleteConfirmation('', '')).toBe(false);
    expect(matchesDeleteConfirmation('', '   ')).toBe(false);
    expect(matchesDeleteConfirmation('  ', '   ')).toBe(false);
  });
});
