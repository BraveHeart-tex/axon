import { confirm } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import {
  abortRebase,
  countCommitsMissingLocally,
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
  pushHeadWithLease,
  rebaseOntoRemoteBranch,
  rebaseOntoRemoteBranchInteractive,
  remoteTrackingBranchExists,
  resolveCommitSha,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  abortRebase: vi.fn(),
  countCommitsMissingLocally: vi.fn(),
  fetchOriginPrune: vi.fn(),
  getCurrentBranchNameForWorktree: vi.fn(),
  isWorkingTreeDirty: vi.fn(),
  pushHeadWithLease: vi.fn(),
  rebaseOntoRemoteBranch: vi.fn(),
  rebaseOntoRemoteBranchInteractive: vi.fn(),
  remoteTrackingBranchExists: vi.fn(),
  resolveCommitSha: vi.fn(),
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
const mockedCountCommitsMissingLocally = vi.mocked(countCommitsMissingLocally);
const mockedFetchOriginPrune = vi.mocked(fetchOriginPrune);
const mockedGetCurrentBranchNameForWorktree = vi.mocked(getCurrentBranchNameForWorktree);
const mockedIsWorkingTreeDirty = vi.mocked(isWorkingTreeDirty);
const mockedPushHeadWithLease = vi.mocked(pushHeadWithLease);
const mockedRebaseOntoRemoteBranch = vi.mocked(rebaseOntoRemoteBranch);
const mockedRebaseOntoRemoteBranchInteractive = vi.mocked(rebaseOntoRemoteBranchInteractive);
const mockedRemoteTrackingBranchExists = vi.mocked(remoteTrackingBranchExists);
const mockedResolveCommitSha = vi.mocked(resolveCommitSha);

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
    mockedPushHeadWithLease.mockResolvedValue(undefined);
    mockedResolveCommitSha.mockResolvedValue('remote-sha');
    mockedCountCommitsMissingLocally.mockResolvedValue(0);
  });

  it('aborts when not on a branch', async () => {
    mockedGetCurrentBranchNameForWorktree.mockResolvedValueOnce('');

    await runSyncBranchFlow('develop');

    expect(logger.error).toHaveBeenCalledWith('Not on a branch');
    expect(process.exitCode).toBe(1);
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
  });

  it('aborts when the working tree is dirty', async () => {
    mockedIsWorkingTreeDirty.mockResolvedValueOnce(true);

    await runSyncBranchFlow('develop');

    expect(logger.error).toHaveBeenCalledWith('Working tree is dirty. Commit or stash first.');
    expect(process.exitCode).toBe(1);
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
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
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
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
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
  });

  it('falls back to interactive rebase after a failed normal rebase when confirmed', async () => {
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));
    mockedConfirm.mockResolvedValueOnce(true);

    await runSyncBranchFlow('develop');

    expect(logger.warn).toHaveBeenCalledWith('Rebase onto origin/develop failed.');
    expect(mockedAbortRebase).toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranchInteractive).toHaveBeenCalledWith('develop');
    expect(mockedPushHeadWithLease).toHaveBeenCalled();
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
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
  });

  it('refuses to sync when origin has commits missing locally', async () => {
    mockedCountCommitsMissingLocally.mockResolvedValueOnce(2);

    await runSyncBranchFlow('develop');

    expect(mockedCountCommitsMissingLocally).toHaveBeenCalledWith('feat/ORD-1325-checkout');
    expect(logger.error).toHaveBeenCalledWith(
      "origin/feat/ORD-1325-checkout has 2 commit(s) you don't have locally. Run git pull --rebase first.",
    );
    expect(process.exitCode).toBe(1);
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
  });

  it('stops without pushing when the commit count cannot be computed', async () => {
    mockedCountCommitsMissingLocally.mockRejectedValueOnce(new Error('Failed to count commits'));

    await runSyncBranchFlow('develop');

    expect(logger.error).toHaveBeenCalledWith('Failed to count commits');
    expect(process.exitCode).toBe(1);
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
  });

  it('leases an empty SHA for a branch that was never pushed', async () => {
    mockedResolveCommitSha.mockResolvedValueOnce('');

    await runSyncBranchFlow('develop');

    expect(mockedCountCommitsMissingLocally).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/ORD-1325-checkout', '');
  });

  it('pushes with lease only after a successful rebase', async () => {
    await runSyncBranchFlow('develop');

    expect(mockedResolveCommitSha).toHaveBeenCalledWith(
      'refs/remotes/origin/feat/ORD-1325-checkout',
    );
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('develop');
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/ORD-1325-checkout', 'remote-sha');
    expect(mockedRebaseOntoRemoteBranch.mock.invocationCallOrder[0]).toBeLessThan(
      mockedPushHeadWithLease.mock.invocationCallOrder[0]!,
    );
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('Synced feat/ORD-1325-checkout with origin/develop.'),
    );
  });
});
