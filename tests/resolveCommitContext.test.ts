import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveCommitContext } from '@/domains/ai/commit/flows/resolveCommitContext.flow.js';
import { getCurrentBranchName, getStagedChangesDiff } from '@/domains/git/git.service.js';
import { editMessageInline } from '@/shared/editMessageInline.js';

vi.mock('@/domains/git/git.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domains/git/git.service.js')>();

  return {
    ...actual,
    getCurrentBranchName: vi.fn(),
    getStagedChangesDiff: vi.fn(),
  };
});

vi.mock('@/shared/editMessageInline.js', () => ({
  editMessageInline: vi.fn(),
}));

const mockedGetCurrentBranchName = vi.mocked(getCurrentBranchName);
const mockedGetStagedChangesDiff = vi.mocked(getStagedChangesDiff);
const mockedEditMessageInline = vi.mocked(editMessageInline);

describe('resolveCommitContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when there are no staged changes', async () => {
    mockedGetStagedChangesDiff.mockResolvedValueOnce('');

    await expect(resolveCommitContext()).rejects.toThrow(
      'No staged changes found. Stage your changes with git add first.',
    );
    expect(mockedEditMessageInline).not.toHaveBeenCalled();
    expect(mockedGetCurrentBranchName).not.toHaveBeenCalled();
  });

  it('trims the optional user hint and derives branch context', async () => {
    mockedGetStagedChangesDiff.mockResolvedValueOnce('diff --git a/file.ts b/file.ts');
    mockedEditMessageInline.mockResolvedValueOnce('  fix retry copy  ');
    mockedGetCurrentBranchName.mockResolvedValueOnce('fix/ORD-1325-payment_retry');

    await expect(resolveCommitContext()).resolves.toEqual({
      diff: 'diff --git a/file.ts b/file.ts',
      userHint: 'fix retry copy',
      branchName: 'fix/ORD-1325-payment_retry',
      inferredScope: 'ORD-1325',
      branchIntent: 'payment retry',
      expectedType: 'fix',
    });
  });

  it('omits the user hint when the prompt returns whitespace', async () => {
    mockedGetStagedChangesDiff.mockResolvedValueOnce('diff --git a/file.ts b/file.ts');
    mockedEditMessageInline.mockResolvedValueOnce('   ');
    mockedGetCurrentBranchName.mockResolvedValueOnce('feat/add-checkout');

    await expect(resolveCommitContext()).resolves.toMatchObject({
      userHint: undefined,
      branchName: 'feat/add-checkout',
      branchIntent: 'add checkout',
      expectedType: 'feat',
    });
  });
});
