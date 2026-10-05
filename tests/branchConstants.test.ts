import { describe, expect, it } from 'vitest';

import { getCommitMessagePrompt } from '@/domains/ai/ai.prompts.js';
import { BRANCH_TYPES, COMMIT_TYPES, toCommitType } from '@/domains/branch/branch.constants.js';

describe('branch types', () => {
  it('maps hotfix and security to fix and keeps the rest as commit types', () => {
    expect(toCommitType('hotfix')).toBe('fix');
    expect(toCommitType('security')).toBe('fix');
    expect(toCommitType('perf')).toBe('perf');
    expect(COMMIT_TYPES).toEqual(
      BRANCH_TYPES.filter((type) => type !== 'hotfix' && type !== 'security'),
    );
  });

  it('lists the shared commit types in the AI prompt', () => {
    const { system } = getCommitMessagePrompt({ diff: '', branchName: 'feat/x' });

    expect(system).toContain(`- Valid types: ${COMMIT_TYPES.join(', ')}`);
  });
});
