import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeGeneratedCommitMessage } from '@/domains/ai/commit/commitMessageFormatter.js';

test('adds inferred scope to a valid conventional commit', () => {
  const message = normalizeGeneratedCommitMessage('fix: prevent duplicate uploads', {
    expectedType: 'fix',
    inferredScope: 'AXN-123',
  });

  assert.equal(message, 'fix(AXN-123): prevent duplicate uploads');
});

test('falls back to inferred type when the model omits the prefix', () => {
  const message = normalizeGeneratedCommitMessage('Prevent duplicate uploads', {
    expectedType: 'fix',
    inferredScope: undefined,
  });

  assert.equal(message, 'fix: Prevent duplicate uploads');
});

test('trims quotes, punctuation, and extra length', () => {
  const message = normalizeGeneratedCommitMessage(
    '"refactor: improve AI message generation quality and reduce repetition."',
    {
      expectedType: 'refactor',
      inferredScope: 'AXN-123',
    },
  );

  assert.equal(message, 'refactor(AXN-123): improve AI message generation quality and reduce');
});
