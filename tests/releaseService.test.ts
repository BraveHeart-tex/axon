import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWorkingTreeDirty } from '@/domains/git/git.service.js';
import { confirmReleasePlan } from '@/domains/release/flows/confirmReleasePlan.flow.js';
import { resolveReleaseInput } from '@/domains/release/flows/resolveReleaseInput.flow.js';
import { createReleaseAbortedError } from '@/domains/release/release.errors.js';
import { executeRelease } from '@/domains/release/release.executor.js';
import { runReleaseFlow } from '@/domains/release/release.service.js';
import type { ReleaseInput } from '@/domains/release/release.types.js';
import { logger } from '@/infra/logger.js';

vi.mock('@/domains/git/git.service.js', () => ({
  isWorkingTreeDirty: vi.fn(),
}));

vi.mock('@/domains/release/flows/resolveReleaseInput.flow.js', () => ({
  resolveReleaseInput: vi.fn(),
}));

vi.mock('@/domains/release/flows/confirmReleasePlan.flow.js', () => ({
  confirmReleasePlan: vi.fn(),
}));

vi.mock('@/domains/release/release.executor.js', () => ({
  executeRelease: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedIsWorkingTreeDirty = vi.mocked(isWorkingTreeDirty);
const mockedResolveReleaseInput = vi.mocked(resolveReleaseInput);
const mockedConfirmReleasePlan = vi.mocked(confirmReleasePlan);
const mockedExecuteRelease = vi.mocked(executeRelease);

const input: ReleaseInput = {
  branchTitle: 'release/ORD-1325',
  commits: ['aaa1111'],
  recentCommits: [],
};

describe('runReleaseFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedIsWorkingTreeDirty.mockResolvedValue(false);
    mockedResolveReleaseInput.mockResolvedValue(input);
    mockedConfirmReleasePlan.mockResolvedValue(true);
    mockedExecuteRelease.mockResolvedValue(undefined);
  });

  it('aborts with an error and does nothing when the working tree is dirty', async () => {
    mockedIsWorkingTreeDirty.mockResolvedValue(true);

    await runReleaseFlow({ author: '' });

    expect(logger.error).toHaveBeenCalledWith('Working tree is dirty. Commit or stash first.');
    expect(mockedResolveReleaseInput).not.toHaveBeenCalled();
    expect(mockedExecuteRelease).not.toHaveBeenCalled();
  });

  it('logs a ReleaseAbortedError as info, not a failure', async () => {
    mockedResolveReleaseInput.mockRejectedValue(createReleaseAbortedError('Release aborted.'));

    await runReleaseFlow({ author: '' });

    expect(logger.info).toHaveBeenCalledWith('Release aborted.');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected errors as a failure', async () => {
    mockedResolveReleaseInput.mockRejectedValue(new Error('network down'));

    await runReleaseFlow({ author: '' });

    expect(logger.error).toHaveBeenCalledWith('Release failed: network down');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('runs the full release when confirmed and the tree is clean', async () => {
    await runReleaseFlow({ author: '' });

    expect(mockedExecuteRelease).toHaveBeenCalledWith({
      branchTitle: input.branchTitle,
      commits: input.commits,
      recentCommits: input.recentCommits,
    });
  });
});
