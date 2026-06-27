import { describe, expect, it } from 'vitest';

import { pickClosestBase } from '@/domains/branch/resolveSyncTarget.flow.js';

describe('pickClosestBase', () => {
  it('picks the candidate with the fewest commits ahead of its merge-base', () => {
    const result = pickClosestBase([
      { name: 'main', ahead: 40 },
      { name: 'develop', ahead: 3 },
    ]);

    expect(result).toBe('develop');
  });

  it('breaks ties by input order', () => {
    const result = pickClosestBase([
      { name: 'develop', ahead: 5 },
      { name: 'main', ahead: 5 },
      { name: 'master', ahead: 5 },
    ]);

    expect(result).toBe('develop');
  });

  it('falls back to develop when there are no candidates', () => {
    const result = pickClosestBase([]);

    expect(result).toBe('develop');
  });
});
