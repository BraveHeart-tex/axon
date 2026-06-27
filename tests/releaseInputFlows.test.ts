import { input } from '@inquirer/prompts';
import inquirer from 'inquirer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecentCommit } from '@/domains/git/git.types.js';
import { resolveListBasedRelease } from '@/domains/release/flows/resolveListBasedRelease.flow.js';
import { resolveManualRelease } from '@/domains/release/flows/resolveManualRelease.flow.js';
import { promptSearchableCommitCheckbox } from '@/ui/prompts/commit.prompts.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock('@/ui/prompts/commit.prompts.js', () => ({
  promptSearchableCommitCheckbox: vi.fn(),
}));

const recentCommits: RecentCommit[] = [
  {
    hash: 'aaa1111',
    author: 'Ada',
    date: 'today',
    message: 'fix: handle ORD-1325 payment retries',
  },
  {
    hash: 'bbb2222',
    author: 'Grace',
    date: 'yesterday',
    message: 'fix: follow up ORD-1325 release guard',
  },
  {
    hash: 'ccc3333',
    author: 'Linus',
    date: 'last week',
    message: 'docs: update release notes',
  },
];

const mockedInput = vi.mocked(input);
const mockedPrompt = vi.mocked(inquirer.prompt);
const mockedCommitCheckbox = vi.mocked(promptSearchableCommitCheckbox);

describe('release input flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveManualRelease', () => {
    it('splits hashes by whitespace and trims the release branch title', async () => {
      mockedPrompt
        .mockResolvedValueOnce({ commitHashes: '  abc123   def456\n789abc  ' })
        .mockResolvedValueOnce({ title: '  urgent-fix  ' });

      await expect(resolveManualRelease()).resolves.toEqual({
        commits: ['abc123', 'def456', '789abc'],
        branchTitle: 'release/urgent-fix',
        recentCommits: [],
      });
    });
  });

  describe('resolveListBasedRelease', () => {
    it('reverses selected commits into cherry-pick order and trims the title', async () => {
      mockedCommitCheckbox.mockResolvedValueOnce(['aaa1111', 'bbb2222']);
      mockedInput.mockResolvedValueOnce('  ORD-1325-hotfix  ');

      await expect(resolveListBasedRelease(recentCommits)).resolves.toEqual({
        branchTitle: 'release/ORD-1325-hotfix',
        commits: ['bbb2222', 'aaa1111'],
        recentCommits: [recentCommits[1], recentCommits[0]],
      });
    });

    it('suggests a release title when all selected commits share a scope', async () => {
      mockedCommitCheckbox.mockResolvedValueOnce(['aaa1111', 'bbb2222']);
      mockedInput.mockResolvedValueOnce('ORD-1325');

      await resolveListBasedRelease(recentCommits);

      expect(mockedInput).toHaveBeenCalledWith(
        expect.objectContaining({
          default: 'ORD-1325',
        }),
      );
    });

    it('does not suggest a release title when selected commit scopes differ', async () => {
      mockedCommitCheckbox.mockResolvedValueOnce(['aaa1111', 'ccc3333']);
      mockedInput.mockResolvedValueOnce('mixed-release');

      await resolveListBasedRelease(recentCommits);

      expect(mockedInput).toHaveBeenCalledWith(
        expect.objectContaining({
          default: '',
        }),
      );
    });
  });
});
