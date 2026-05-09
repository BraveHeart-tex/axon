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

test('trims quotes, punctuation, and keeps useful length', () => {
  const message = normalizeGeneratedCommitMessage(
    '"refactor: improve AI message generation quality and reduce repetition."',
    {
      expectedType: 'refactor',
      inferredScope: 'AXN-123',
    },
  );

  assert.equal(
    message,
    'refactor(AXN-123): improve AI message generation quality and reduce repetition',
  );
});

test('does not leave dangling connective words after truncation', () => {
  const message = normalizeGeneratedCommitMessage(
    'fix: improve generated commit suggestions for staged changes and branch context',
    {
      expectedType: 'fix',
      inferredScope: 'LONG-SCOPE-1234567890',
    },
  );

  assert.equal(
    message,
    'fix(LONG-SCOPE-1234567890): improve generated commit suggestions for staged changes',
  );
});
