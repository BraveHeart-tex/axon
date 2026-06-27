import { confirm } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import {
  abortRebase,
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
  pushCurrentBranchWithLease,
  rebaseOntoRemoteBranch,
  rebaseOntoRemoteBranchInteractive,
  remoteTrackingBranchExists,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  abortRebase: vi.fn(),
  fetchOriginPrune: vi.fn(),
  getCurrentBranchNameForWorktree: vi.fn(),
  isWorkingTreeDirty: vi.fn(),
  pushCurrentBranchWithLease: vi.fn(),
  rebaseOntoRemoteBranch: vi.fn(),
  rebaseOntoRemoteBranchInteractive: vi.fn(),
  remoteTrackingBranchExists: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/domains/branch/resolveSyncTarget.flow.js', () => ({
  resolveSyncTarget: vi.fn(),
}));

const mockedConfirm = vi.mocked(confirm);
const mockedAbortRebase = vi.mocked(abortRebase);
const mockedFetchOriginPrune = vi.mocked(fetchOriginPrune);
const mockedGetCurrentBranchNameForWorktree = vi.mocked(getCurrentBranchNameForWorktree);
const mockedIsWorkingTreeDirty = vi.mocked(isWorkingTreeDirty);
const mockedPushCurrentBranchWithLease = vi.mocked(pushCurrentBranchWithLease);
const mockedRebaseOntoRemoteBranch = vi.mocked(rebaseOntoRemoteBranch);
const mockedRebaseOntoRemoteBranchInteractive = vi.mocked(rebaseOntoRemoteBranchInteractive);
const mockedRemoteTrackingBranchExists = vi.mocked(remoteTrackingBranchExists);

describe('runSyncBranchFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockedGetCurrentBranchNameForWorktree.mockResolvedValue('feat/ORD-1325-checkout');
    mockedIsWorkingTreeDirty.mockResolvedValue(false);
    mockedFetchOriginPrune.mockResolvedValue(undefined);
    mockedRemoteTrackingBranchExists.mockResolvedValue(true);
    mockedRebaseOntoRemoteBranch.mockResolvedValue(undefined);
    mockedAbortRebase.mockResolvedValue(undefined);
    mockedRebaseOntoRemoteBranchInteractive.mockResolvedValue(undefined);
    mockedPushCurrentBranchWithLease.mockResolvedValue(undefined);
  });

  it('aborts when not on a branch', async () => {
    mockedGetCurrentBranchNameForWorktree.mockResolvedValueOnce('');

    await runSyncBranchFlow('develop');

    expect(logger.error).toHaveBeenCalledWith('Not on a branch');
    expect(process.exitCode).toBe(1);
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
    expect(mockedPushCurrentBranchWithLease).not.toHaveBeenCalled();
  });

  it('aborts when the working tree is dirty', async () => {
    mockedIsWorkingTreeDirty.mockResolvedValueOnce(true);

    await runSyncBranchFlow('develop');

    expect(logger.error).toHaveBeenCalledWith('Working tree is dirty. Commit or stash first.');
    expect(process.exitCode).toBe(1);
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
    expect(mockedPushCurrentBranchWithLease).not.toHaveBeenCalled();
  });

  it('requires confirmation before syncing a release branch onto develop', async () => {
    mockedGetCurrentBranchNameForWorktree.mockResolvedValueOnce('release/ORD-1325');
    mockedConfirm.mockResolvedValueOnce(false);

    await runSyncBranchFlow('develop');

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('release branch'));
    expect(mockedConfirm).toHaveBeenCalledWith({
      message: 'Sync release branch onto origin/develop?',
      default: false,
    });
    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
    expect(mockedPushCurrentBranchWithLease).not.toHaveBeenCalled();
  });

  it('requires confirmation before syncing a feature branch onto main', async () => {
    mockedConfirm.mockResolvedValueOnce(false);

    await runSyncBranchFlow('main');

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('feature branch'));
    expect(mockedConfirm).toHaveBeenCalledWith({
      message: 'Rebase feature branch onto origin/main?',
      default: false,
    });
    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
    expect(mockedPushCurrentBranchWithLease).not.toHaveBeenCalled();
  });

  it('falls back to interactive rebase after a failed normal rebase when confirmed', async () => {
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));
    mockedConfirm.mockResolvedValueOnce(true);

    await runSyncBranchFlow('develop');

    expect(logger.warn).toHaveBeenCalledWith('Rebase onto origin/develop failed.');
    expect(mockedAbortRebase).toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranchInteractive).toHaveBeenCalledWith('develop');
    expect(mockedPushCurrentBranchWithLease).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('does not push when rebase fails and interactive fallback is declined', async () => {
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));
    mockedConfirm.mockResolvedValueOnce(false);

    await runSyncBranchFlow('develop');

    expect(logger.error).toHaveBeenCalledWith(
      'Rebase of feat/ORD-1325-checkout onto origin/develop failed.',
    );
    expect(process.exitCode).toBe(1);
    expect(mockedPushCurrentBranchWithLease).not.toHaveBeenCalled();
  });

  it('pushes with lease only after a successful rebase', async () => {
    await runSyncBranchFlow('develop');

    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('develop');
    expect(mockedPushCurrentBranchWithLease).toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranch.mock.invocationCallOrder[0]).toBeLessThan(
      mockedPushCurrentBranchWithLease.mock.invocationCallOrder[0]!,
    );
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('Synced feat/ORD-1325-checkout with origin/develop.'),
    );
  });
});
