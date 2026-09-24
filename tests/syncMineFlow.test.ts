import { confirm } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import {
  abortRebaseStrict,
  checkoutBranch,
  checkoutDetached,
  countLocalOnlyCommits,
  fetchOriginPrune,
  getCheckedOutBranches,
  getCurrentBranchNameForWorktree,
  isRebaseInProgress,
  isWorkingTreeDirty,
  pushHeadWithLease,
  rebaseOntoRemoteBranch,
  resolveCommitSha,
  updateLocalBranchRef,
} from '@/domains/git/git.service.js';
import { checkGlabAuth, listMyOpenMergeRequests } from '@/domains/mr/glab.service.js';
import { createInterruptHandler } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  abortRebaseStrict: vi.fn(),
  checkoutBranch: vi.fn(),
  checkoutDetached: vi.fn(),
  countLocalOnlyCommits: vi.fn(),
  fetchOriginPrune: vi.fn(),
  getCheckedOutBranches: vi.fn(),
  getCurrentBranchNameForWorktree: vi.fn(),
  isRebaseInProgress: vi.fn(),
  isWorkingTreeDirty: vi.fn(),
  pushHeadWithLease: vi.fn(),
  rebaseOntoRemoteBranch: vi.fn(),
  resolveCommitSha: vi.fn(),
  updateLocalBranchRef: vi.fn(),
}));

vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedConfirm = vi.mocked(confirm);
const mockedAbortRebaseStrict = vi.mocked(abortRebaseStrict);
const mockedCheckoutBranch = vi.mocked(checkoutBranch);
const mockedCheckoutDetached = vi.mocked(checkoutDetached);
const mockedCountLocalOnlyCommits = vi.mocked(countLocalOnlyCommits);
const mockedFetchOriginPrune = vi.mocked(fetchOriginPrune);
const mockedGetCheckedOutBranches = vi.mocked(getCheckedOutBranches);
const mockedGetCurrentBranchNameForWorktree = vi.mocked(getCurrentBranchNameForWorktree);
const mockedIsRebaseInProgress = vi.mocked(isRebaseInProgress);
const mockedIsWorkingTreeDirty = vi.mocked(isWorkingTreeDirty);
const mockedPushHeadWithLease = vi.mocked(pushHeadWithLease);
const mockedRebaseOntoRemoteBranch = vi.mocked(rebaseOntoRemoteBranch);
const mockedResolveCommitSha = vi.mocked(resolveCommitSha);
const mockedUpdateLocalBranchRef = vi.mocked(updateLocalBranchRef);
const mockedCheckGlabAuth = vi.mocked(checkGlabAuth);
const mockedListMyOpenMergeRequests = vi.mocked(listMyOpenMergeRequests);

const mrOne = { iid: '1', sourceBranch: 'feat/one', targetBranch: 'develop' };
const mrTwo = { iid: '2', sourceBranch: 'feat/two', targetBranch: 'develop' };

const shas: Record<string, string> = {
  'refs/remotes/origin/feat/one': 'origin-one',
  'refs/remotes/origin/feat/two': 'origin-two',
  'refs/heads/feat/one': 'local-one',
  HEAD: 'rebased',
};

describe('runSyncMineFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockedCheckGlabAuth.mockResolvedValue(true);
    mockedIsWorkingTreeDirty.mockResolvedValue(false);
    mockedGetCurrentBranchNameForWorktree.mockResolvedValue('feat/current');
    mockedListMyOpenMergeRequests.mockResolvedValue([]);
    mockedFetchOriginPrune.mockResolvedValue(undefined);
    mockedCheckoutDetached.mockResolvedValue(undefined);
    mockedCheckoutBranch.mockResolvedValue(undefined);
    mockedResolveCommitSha.mockImplementation(async (ref) => shas[ref] ?? '');
    mockedCountLocalOnlyCommits.mockResolvedValue(0);
    mockedRebaseOntoRemoteBranch.mockResolvedValue(undefined);
    mockedIsRebaseInProgress.mockResolvedValue(true);
    mockedAbortRebaseStrict.mockResolvedValue(undefined);
    mockedPushHeadWithLease.mockResolvedValue(undefined);
    mockedGetCheckedOutBranches.mockResolvedValue(new Set());
    mockedUpdateLocalBranchRef.mockResolvedValue(undefined);
  });

  it('aborts when glab is not authenticated', async () => {
    mockedCheckGlabAuth.mockResolvedValueOnce(false);

    await runSyncMineFlow({ yes: false });

    expect(logger.error).toHaveBeenCalledWith(
      'glab is not installed or not authenticated. Run `glab auth login` first.',
    );
    expect(process.exitCode).toBe(1);
    expect(mockedIsWorkingTreeDirty).not.toHaveBeenCalled();
  });

  it('aborts when the working tree is dirty', async () => {
    mockedIsWorkingTreeDirty.mockResolvedValueOnce(true);

    await runSyncMineFlow({ yes: false });

    expect(logger.error).toHaveBeenCalledWith('Working tree is dirty. Commit or stash first.');
    expect(process.exitCode).toBe(1);
    expect(mockedListMyOpenMergeRequests).not.toHaveBeenCalled();
  });

  it('reports when there are no open MRs', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([]);

    await runSyncMineFlow({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('No open MRs assigned to you.');
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
  });

  it('aborts sync when confirm is declined', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedConfirm.mockResolvedValueOnce(false);

    await runSyncMineFlow({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
    expect(mockedCheckoutDetached).not.toHaveBeenCalled();
  });

  it('exits 0 without an error line when the confirm prompt is cancelled', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedConfirm.mockRejectedValueOnce(
      Object.assign(new Error('User force closed the prompt with SIGINT'), {
        name: 'ExitPromptError',
      }),
    );

    await runSyncMineFlow({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(logger.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(mockedFetchOriginPrune).not.toHaveBeenCalled();
  });

  it('skips the confirm prompt when yes is true', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await runSyncMineFlow({ yes: true });

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginPrune).toHaveBeenCalled();
    expect(mockedCheckoutDetached).toHaveBeenCalledWith('origin/feat/one', {
      cancelSignal: expect.any(AbortSignal),
    });
  });

  it('rebases origin/<src>, pushes with an explicit lease and updates the local branch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await runSyncMineFlow({ yes: true });

    expect(mockedCountLocalOnlyCommits).toHaveBeenCalledWith('origin-one', 'local-one');
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('develop', {
      cancelSignal: expect.any(AbortSignal),
    });
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/one', 'origin-one', {
      cancelSignal: expect.any(AbortSignal),
    });
    expect(mockedUpdateLocalBranchRef).toHaveBeenCalledWith('feat/one', 'rebased', 'local-one');
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('feat/current');
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/one'));
    expect(process.exitCode).toBeUndefined();
  });

  it('never creates a local branch when none exists', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrTwo]);

    await runSyncMineFlow({ yes: true });

    expect(mockedCountLocalOnlyCommits).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/two', 'origin-two', {
      cancelSignal: expect.any(AbortSignal),
    });
    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
  });

  it('prints a reset hint instead of moving a branch checked out in another worktree', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedGetCheckedOutBranches.mockResolvedValueOnce(new Set(['feat/one']));

    await runSyncMineFlow({ yes: true });

    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('git reset --keep origin/feat/one'),
    );
  });

  it('skips an MR whose local branch has local-only commits', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedCountLocalOnlyCommits.mockResolvedValueOnce(1);

    await runSyncMineFlow({ yes: true });

    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledTimes(1);
    expect(mockedPushHeadWithLease).toHaveBeenCalledTimes(1);
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/two', 'origin-two', {
      cancelSignal: expect.any(AbortSignal),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — skipped (local-only commits)'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('fails the MR without pushing when the local-only count cannot be computed', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedCountLocalOnlyCommits.mockRejectedValueOnce(new Error('Failed to count commits'));

    await runSyncMineFlow({ yes: true });

    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — failed (Failed to count commits)'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a pushed MR as synced when updating the local branch fails', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedGetCheckedOutBranches.mockRejectedValueOnce(new Error('worktree list failed'));

    await runSyncMineFlow({ yes: true });

    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('local feat/one was not updated: worktree list failed'),
    );
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/one'));
    expect(process.exitCode).toBeUndefined();
  });

  it('marks every MR not run (interrupted) when Ctrl+C lands during the fetch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    const interrupt = createInterruptHandler({ exit: vi.fn(), stdout: vi.fn(), stderr: vi.fn() });
    let cleanup: Promise<void> | undefined;
    mockedFetchOriginPrune.mockImplementationOnce(async () => {
      cleanup = interrupt();
      throw new Error('fetch killed');
    });

    await runSyncMineFlow({ yes: true });
    await cleanup;

    expect(mockedCheckoutDetached).not.toHaveBeenCalled();
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('feat/current');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — not run (interrupted)'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/two -> develop — not run (interrupted)'),
    );
    expect(logger.error).not.toHaveBeenCalledWith('fetch killed');
  });

  it('aborts a conflicting rebase, continues with the next MR and restores the original branch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));

    await runSyncMineFlow({ yes: true });

    expect(mockedAbortRebaseStrict).toHaveBeenCalledTimes(1);
    expect(mockedPushHeadWithLease).toHaveBeenCalledTimes(1);
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/two', 'origin-two', {
      cancelSignal: expect.any(AbortSignal),
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — failed (conflict)'),
    );
    expect(mockedCheckoutBranch).toHaveBeenCalledTimes(1);
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('feat/current');
    expect(process.exitCode).toBe(1);
  });

  it('does not abort when the rebase failed before starting', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('invalid upstream'));
    mockedIsRebaseInProgress.mockResolvedValueOnce(false);

    await runSyncMineFlow({ yes: true });

    expect(mockedAbortRebaseStrict).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed (rebase onto origin/develop failed)'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('stops the run when the rebase abort fails and prints the recovery command', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));
    mockedAbortRebaseStrict.mockRejectedValueOnce(new Error('Failed to abort rebase: boom'));

    await runSyncMineFlow({ yes: true });

    expect(mockedCheckoutDetached).toHaveBeenCalledTimes(1);
    expect(mockedCheckoutBranch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/two -> develop — not run'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('git rebase --abort && git checkout feat/current'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('records a checkout failure as failed for that MR and continues to the next one', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedCheckoutDetached.mockRejectedValueOnce(new Error('checkout failed'));

    await runSyncMineFlow({ yes: true });

    expect(mockedCheckoutDetached).toHaveBeenCalledTimes(2);
    expect(mockedPushHeadWithLease).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
    expect(mockedCheckoutBranch).toHaveBeenCalledTimes(1);
  });

  it('records a rejected push as failed', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedPushHeadWithLease.mockRejectedValueOnce(new Error('stale info'));

    await runSyncMineFlow({ yes: true });

    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed (stale info)'));
    expect(process.exitCode).toBe(1);
  });

  it('still prints the summary and a recovery command when restoring the branch fails', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedCheckoutBranch.mockRejectedValueOnce(new Error('Failed to checkout branch feat/current'));

    await runSyncMineFlow({ yes: true });

    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/one'));
    expect(logger.error).toHaveBeenCalledWith('Failed to checkout branch feat/current');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('git checkout feat/current'));
    expect(process.exitCode).toBe(1);
  });
});
