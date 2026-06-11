import assert from 'node:assert/strict';
import test from 'node:test';

import { pickClosestBase } from '@/domains/branch/resolveSyncTarget.flow.js';

test('picks the candidate with the fewest commits ahead of its merge-base', () => {
  const result = pickClosestBase([
    { name: 'main', ahead: 40 },
    { name: 'develop', ahead: 3 },
  ]);

  assert.equal(result, 'develop');
});

test('breaks ties by input order', () => {
  const result = pickClosestBase([
    { name: 'develop', ahead: 5 },
    { name: 'main', ahead: 5 },
    { name: 'master', ahead: 5 },
  ]);

  assert.equal(result, 'develop');
});

test('falls back to develop when there are no candidates', () => {
  const result = pickClosestBase([]);

  assert.equal(result, 'develop');
});
