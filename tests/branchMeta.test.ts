import inquirer from 'inquirer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { suggestBranchType } from '@/domains/feature/feature.constants.js';
import { resolveBranchMeta } from '@/domains/feature/flows/resolveBranchMeta.flow.js';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

const mockedPrompt = vi.mocked(inquirer.prompt);

describe('feature branch metadata helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('suggestBranchType', () => {
    it('suggests fix for bug work types case-insensitively', () => {
      expect(suggestBranchType('Bug')).toBe('fix');
    });

    it('returns undefined for unknown or missing work types', () => {
      expect(suggestBranchType('Task')).toBeUndefined();
      expect(suggestBranchType()).toBeUndefined();
    });
  });

  describe('resolveBranchMeta', () => {
    it('normalizes a mixed-case description with punctuation into a branch slug', async () => {
      mockedPrompt.mockResolvedValueOnce({
        commitLabel: 'fix',
        shortDesc: '  Payment Retry: Cleanup!!! ',
      });

      await expect(resolveBranchMeta('ORD-1325', 'Bug')).resolves.toEqual({
        commitLabel: 'fix',
        slug: 'payment-retry-cleanup',
      });
    });

    it('returns an empty slug for an empty description', async () => {
      mockedPrompt.mockResolvedValueOnce({
        commitLabel: 'feat',
        shortDesc: '',
      });

      await expect(resolveBranchMeta('ORD-1325')).resolves.toEqual({
        commitLabel: 'feat',
        slug: '',
      });
    });
  });
});
