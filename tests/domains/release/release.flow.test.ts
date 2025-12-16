import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { runReleaseFlow } from '@/domains/release/release.service.js';

vi.mock('@/domains/git/git.service.js', () => ({
  checkoutBranch: vi.fn(),
  pullBranch: vi.fn(),
  createBranch: vi.fn(),
  cherryPickCommit: vi.fn(),
}));

vi.mock('@/domains/release/flows/resolveReleaseInput.flow.js', () => ({
  resolveReleaseInput: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  checkoutBranch,
  cherryPickCommit,
  createBranch,
  pullBranch,
} from '@/domains/git/git.service.js';
import { resolveReleaseInput } from '@/domains/release/flows/resolveReleaseInput.flow.js';
import type { ReleaseOptions } from '@/domains/release/release.types.js';
import { logger } from '@/infra/logger.js';

describe('runReleaseFlow', () => {
  const baseOptions: ReleaseOptions = {
    onlyUnmerged: false,
    author: '',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should perform the full release flow and cherry-pick all commits', async () => {
    (resolveReleaseInput as Mock).mockResolvedValue({
      branchTitle: 'release/FE-1',
      commits: ['abc123', 'def456'],
    });

    await runReleaseFlow(baseOptions);

    expect(resolveReleaseInput).toHaveBeenCalledWith(baseOptions);

    expect(logger.info).toHaveBeenCalledWith('Checking out main and pulling latest changes...');
    expect(checkoutBranch).toHaveBeenCalledWith('main');
    expect(pullBranch).toHaveBeenCalledWith('main');

    expect(logger.info).toHaveBeenCalledWith('Creating release branch: release/FE-1');
    expect(createBranch).toHaveBeenCalledWith('release/FE-1');

    expect(logger.info).toHaveBeenCalledWith('🍒 Cherry-picking commits:');
    expect(logger.info).toHaveBeenCalledWith('- abc123');
    expect(logger.info).toHaveBeenCalledWith('- def456');
    expect(cherryPickCommit).toHaveBeenCalledWith('abc123');
    expect(cherryPickCommit).toHaveBeenCalledWith('def456');

    expect(logger.info).toHaveBeenCalledWith(
      'Release branch release/FE-1 created and commits cherry-picked.',
    );
  });

  it('should log an error and stop when checkout of main fails', async () => {
    (resolveReleaseInput as Mock).mockResolvedValue({
      branchTitle: 'release/FE-1',
      commits: ['abc123'],
    });

    (checkoutBranch as Mock).mockRejectedValue(new Error('Failed to checkout branch main'));

    await runReleaseFlow(baseOptions);

    expect(checkoutBranch).toHaveBeenCalledWith('main');
    expect(pullBranch).not.toHaveBeenCalled();
    expect(createBranch).not.toHaveBeenCalled();
    expect(cherryPickCommit).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Git operation failed: Failed to checkout branch main'),
    );
  });

  it('should log an error when a cherry-pick operation fails', async () => {
    (resolveReleaseInput as Mock).mockResolvedValue({
      branchTitle: 'release/FE-1',
      commits: ['abc123', 'def456'],
    });

    (cherryPickCommit as Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Cherry-pick failed'));

    await runReleaseFlow(baseOptions);

    expect(cherryPickCommit).toHaveBeenCalledTimes(2);
    expect(cherryPickCommit).toHaveBeenNthCalledWith(1, 'abc123');
    expect(cherryPickCommit).toHaveBeenNthCalledWith(2, 'def456');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Git operation failed: Cherry-pick failed'),
    );
  });

  it('should log an error when resolving release input fails', async () => {
    (resolveReleaseInput as Mock).mockRejectedValue(new Error('Prompt failed'));

    await runReleaseFlow(baseOptions);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Git operation failed: Prompt failed'),
    );
    expect(checkoutBranch).not.toHaveBeenCalled();
    expect(pullBranch).not.toHaveBeenCalled();
    expect(createBranch).not.toHaveBeenCalled();
    expect(cherryPickCommit).not.toHaveBeenCalled();
  });
});
