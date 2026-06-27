import { describe, expect, it } from 'vitest';

import { normalizeGeneratedCommitMessage } from '@/domains/ai/commit/commitMessageFormatter.js';

describe('normalizeGeneratedCommitMessage', () => {
  it('adds inferred scope to a valid conventional commit', () => {
    const message = normalizeGeneratedCommitMessage('fix: prevent duplicate uploads', {
      expectedType: 'fix',
      inferredScope: 'AXN-123',
    });

    expect(message).toBe('fix(AXN-123): prevent duplicate uploads');
  });

  it('falls back to inferred type when the model omits the prefix', () => {
    const message = normalizeGeneratedCommitMessage('Prevent duplicate uploads', {
      expectedType: 'fix',
      inferredScope: undefined,
    });

    expect(message).toBe('fix: Prevent duplicate uploads');
  });

  it('trims quotes, punctuation, and keeps useful length', () => {
    const message = normalizeGeneratedCommitMessage(
      '"refactor: improve AI message generation quality and reduce repetition."',
      {
        expectedType: 'refactor',
        inferredScope: 'AXN-123',
      },
    );

    expect(message).toBe(
      'refactor(AXN-123): improve AI message generation quality and reduce repetition',
    );
  });

  it('does not leave dangling connective words after truncation', () => {
    const message = normalizeGeneratedCommitMessage(
      'fix: improve generated commit suggestions for staged changes and branch and context',
      {
        expectedType: 'fix',
        inferredScope: 'LONG-SCOPE-1234567890',
      },
    );

    expect(message).toBe(
      'fix(LONG-SCOPE-1234567890): improve generated commit suggestions for staged changes and branch',
    );
  });
});
