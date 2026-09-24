import { confirm } from '@inquirer/prompts';
import ora from 'ora';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import {
  abortRebaseStrict,
  checkoutBranch,
  checkoutDetached,
  countLocalOnlyCommits,
  fetchOriginBranches,
  getCheckedOutBranches,
  getCurrentBranchNameForWorktree,
  isAncestor,
  isRebaseInProgress,
  isWorkingTreeDirty,
  listRemoteBranches,
  pushHeadWithLease,
  rebaseOntoRemoteBranch,
  resolveCommitSha,
  updateLocalBranchRef,
} from '@/domains/git/git.service.js';
import {
  checkGlabAuth,
  listMyOpenMergeRequests,
  MyMergeRequest,
} from '@/domains/mr/glab.service.js';
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
  fetchOriginBranches: vi.fn(),
  getCheckedOutBranches: vi.fn(),
  getCurrentBranchNameForWorktree: vi.fn(),
  isAncestor: vi.fn(),
  isRebaseInProgress: vi.fn(),
  isWorkingTreeDirty: vi.fn(),
  listRemoteBranches: vi.fn(),
  pushHeadWithLease: vi.fn(),
  rebaseOntoRemoteBranch: vi.fn(),
  resolveCommitSha: vi.fn(),
  updateLocalBranchRef: vi.fn(),
}));

vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

const spinner = {
  fail: vi.fn(),
  info: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  succeed: vi.fn(),
  warn: vi.fn(),
};
spinner.start.mockReturnValue(spinner);

vi.mock('ora', () => ({
  default: vi.fn(() => spinner),
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
const mockedFetchOriginBranches = vi.mocked(fetchOriginBranches);
const mockedGetCheckedOutBranches = vi.mocked(getCheckedOutBranches);
const mockedGetCurrentBranchNameForWorktree = vi.mocked(getCurrentBranchNameForWorktree);
const mockedIsAncestor = vi.mocked(isAncestor);
const mockedIsRebaseInProgress = vi.mocked(isRebaseInProgress);
const mockedIsWorkingTreeDirty = vi.mocked(isWorkingTreeDirty);
const mockedListRemoteBranches = vi.mocked(listRemoteBranches);
const mockedPushHeadWithLease = vi.mocked(pushHeadWithLease);
const mockedRebaseOntoRemoteBranch = vi.mocked(rebaseOntoRemoteBranch);
const mockedResolveCommitSha = vi.mocked(resolveCommitSha);
const mockedUpdateLocalBranchRef = vi.mocked(updateLocalBranchRef);
const mockedCheckGlabAuth = vi.mocked(checkGlabAuth);
const mockedListMyOpenMergeRequests = vi.mocked(listMyOpenMergeRequests);

const mr = (iid: string, sourceBranch: string, overrides: Partial<MyMergeRequest> = {}) => ({
  iid,
  sourceBranch,
  targetBranch: 'develop',
  sourceProjectId: 7,
  targetProjectId: 7,
  draft: false,
  ...overrides,
});

const mrOne = mr('1', 'feat/one');
const mrTwo = mr('2', 'feat/two');

const gitOptions = { cancelSignal: expect.any(AbortSignal), captureOutput: true };

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
    mockedListRemoteBranches.mockImplementation(async (branches) => new Set(branches));
    mockedFetchOriginBranches.mockResolvedValue(undefined);
    mockedIsAncestor.mockResolvedValue(false);
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

    expect(logger.info).toHaveBeenCalledWith('No open MRs authored by or assigned to you.');
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginBranches).not.toHaveBeenCalled();
  });

  it('aborts sync when confirm is declined', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedConfirm.mockResolvedValueOnce(false);

    await runSyncMineFlow({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(mockedFetchOriginBranches).not.toHaveBeenCalled();
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
    expect(mockedFetchOriginBranches).not.toHaveBeenCalled();
  });

  it('skips the confirm prompt when yes is true', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await runSyncMineFlow({ yes: true });

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginBranches).toHaveBeenCalled();
    expect(mockedCheckoutDetached).toHaveBeenCalledWith('origin/feat/one', gitOptions);
  });

  it('rebases origin/<src>, pushes with an explicit lease and updates the local branch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await runSyncMineFlow({ yes: true });

    expect(mockedCountLocalOnlyCommits).toHaveBeenCalledWith('origin-one', 'local-one');
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('develop', gitOptions);
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/one', 'origin-one', gitOptions);
    expect(mockedUpdateLocalBranchRef).toHaveBeenCalledWith('feat/one', 'rebased', 'local-one');
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('feat/current');
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/one'));
    expect(process.exitCode).toBeUndefined();
  });

  it('never creates a local branch when none exists', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrTwo]);

    await runSyncMineFlow({ yes: true });

    expect(mockedCountLocalOnlyCommits).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/two', 'origin-two', gitOptions);
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
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/two', 'origin-two', gitOptions);
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
    mockedFetchOriginBranches.mockImplementationOnce(async () => {
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
    expect(process.exitCode).toBe(130);
  });

  it('aborts a conflicting rebase, continues with the next MR and restores the original branch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));

    await runSyncMineFlow({ yes: true });

    expect(mockedAbortRebaseStrict).toHaveBeenCalledTimes(1);
    expect(mockedPushHeadWithLease).toHaveBeenCalledTimes(1);
    expect(mockedPushHeadWithLease).toHaveBeenCalledWith('feat/two', 'origin-two', gitOptions);
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
    mockedPushHeadWithLease.mockRejectedValueOnce(
      new Error('Command failed with exit code 1: git push\n\n ! [rejected] (stale info)'),
    );
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runSyncMineFlow({ yes: true });

    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed (push failed)'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('(stale info)'));
    expect(process.exitCode).toBe(1);
    stderr.mockRestore();
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

  const summaryLines = () =>
    [logger.success, logger.warn, logger.error]
      .flatMap((log) => vi.mocked(log).mock.calls)
      .map(([line]) => line)
      .filter((line) => line.startsWith('  !'));

  it.each([
    ['fork', mr('1', 'feat/fork', { sourceProjectId: 99 })],
    ['draft', mr('1', 'feat/draft', { draft: true })],
    ['guardrail', mr('1', 'release/1.2')],
    ['guardrail', mr('1', 'feat/hotfix', { targetBranch: 'main' })],
  ])('reports a %s MR as skipped without touching git', async (reason, skipped) => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([skipped]);

    await runSyncMineFlow({ yes: false });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `!1: ${skipped.sourceBranch} -> ${skipped.targetBranch} — skipped (${reason})`,
      ),
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedListRemoteBranches).not.toHaveBeenCalled();
    expect(mockedCheckoutDetached).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('prints the axon sb command for a guardrail-skipped MR', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mr('1', 'release/1.2')]);

    await runSyncMineFlow({ yes: true });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('git checkout release/1.2 && axon sb develop'),
      false,
    );
  });

  it('fetches only the unique source and target branches that exist on origin', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([
      mrOne,
      mrTwo,
      mr('3', 'feat/gone'),
      mr('4', 'feat/draft', { draft: true }),
    ]);
    mockedListRemoteBranches.mockResolvedValueOnce(new Set(['feat/one', 'feat/two', 'develop']));

    await runSyncMineFlow({ yes: true });

    expect(mockedListRemoteBranches).toHaveBeenCalledWith(
      ['feat/one', 'develop', 'feat/two', 'feat/gone'],
      { cancelSignal: expect.any(AbortSignal) },
    );
    expect(mockedFetchOriginBranches).toHaveBeenCalledWith(['feat/one', 'develop', 'feat/two'], {
      cancelSignal: expect.any(AbortSignal),
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!3: feat/gone -> develop — failed (origin/feat/gone not found)'),
    );
    expect(mockedCheckoutDetached).toHaveBeenCalledTimes(2);
    expect(mockedPushHeadWithLease).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(1);
  });

  it('fails an MR whose target is missing on origin and continues', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([
      mr('1', 'feat/one', { targetBranch: 'gone' }),
      mrTwo,
    ]);
    mockedListRemoteBranches.mockResolvedValueOnce(new Set(['feat/one', 'feat/two', 'develop']));

    await runSyncMineFlow({ yes: true });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> gone — failed (origin/gone not found)'),
    );
    expect(mockedPushHeadWithLease).toHaveBeenCalledExactlyOnceWith(
      'feat/two',
      'origin-two',
      gitOptions,
    );
  });

  it('never checks out, rebases or pushes an up-to-date MR', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedIsAncestor.mockResolvedValueOnce(true);

    await runSyncMineFlow({ yes: true });

    expect(mockedIsAncestor).toHaveBeenCalledWith(
      'refs/remotes/origin/develop',
      'refs/remotes/origin/feat/one',
      gitOptions,
    );
    expect(mockedCheckoutDetached).not.toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
    expect(mockedPushHeadWithLease).not.toHaveBeenCalled();
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — up-to-date'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('prints the axon sb command for a conflict', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));

    await runSyncMineFlow({ yes: true });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('git checkout feat/one && axon sb develop'),
      false,
    );
  });

  it('shows progress as [i/N] for every MR it syncs', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedIsAncestor.mockResolvedValueOnce(true);

    await runSyncMineFlow({ yes: true });

    expect(ora).toHaveBeenCalledWith(
      expect.objectContaining({ text: '[1/2] !1 feat/one -> develop' }),
    );
    expect(ora).toHaveBeenCalledWith(
      expect.objectContaining({ text: '[2/2] !2 feat/two -> develop' }),
    );
    expect(spinner.info).toHaveBeenCalledWith('[1/2] !1 feat/one -> develop — up-to-date');
    expect(spinner.succeed).toHaveBeenCalledWith('[2/2] !2 feat/two -> develop — synced');
  });

  it('groups the summary by status and lists every MR exactly once', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([
      mr('1', 'feat/conflict'),
      mr('2', 'feat/draft', { draft: true }),
      mr('3', 'feat/current-already'),
      mr('4', 'feat/synced'),
    ]);
    mockedIsAncestor.mockImplementation(async (_target, source) =>
      source.endsWith('feat/current-already'),
    );
    mockedRebaseOntoRemoteBranch.mockRejectedValueOnce(new Error('conflict'));

    await runSyncMineFlow({ yes: true });

    expect(summaryLines().map((line) => line.split(' — ')[1])).toEqual([
      'synced',
      'up-to-date',
      'skipped (draft)',
      'failed (conflict)',
    ]);
    expect(summaryLines().map((line) => line.split(':')[0]?.trim())).toEqual([
      '!4',
      '!3',
      '!2',
      '!1',
    ]);
  });

  it('exits 1 and reports every MR not run when the fetch fails', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([
      mrOne,
      mr('2', 'feat/draft', { draft: true }),
    ]);
    mockedFetchOriginBranches.mockRejectedValueOnce(new Error('Failed to fetch from origin: boom'));

    await runSyncMineFlow({ yes: true });

    expect(mockedCheckoutDetached).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — not run (fetch failed)'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/draft -> develop — skipped (draft)'),
    );
    expect(logger.error).toHaveBeenCalledWith('Failed to fetch from origin: boom');
    expect(process.exitCode).toBe(1);
  });

  it('tells the user to set up credentials when the push needs a prompt', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedPushHeadWithLease.mockRejectedValueOnce(
      new Error(
        "Command failed with exit code 128: git push\n\nfatal: could not read Username for 'https://gitlab.com': terminal prompts disabled",
      ),
    );
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runSyncMineFlow({ yes: true });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Set up a credential helper or SSH agent'),
      false,
    );
    expect(process.exitCode).toBe(1);
    stderr.mockRestore();
  });

  it('tells the user to set up credentials when the fetch needs a prompt', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedListRemoteBranches.mockRejectedValueOnce(
      new Error('Failed to list branches on origin: terminal prompts disabled'),
    );

    await runSyncMineFlow({ yes: true });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Set up a credential helper or SSH agent'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('exits 130 when Ctrl+C interrupts an MR mid-run', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    const exit = vi.fn();
    const interrupt = createInterruptHandler({ exit, stdout: vi.fn(), stderr: vi.fn() });
    let cleanup: Promise<void> | undefined;
    mockedRebaseOntoRemoteBranch.mockImplementationOnce(async () => {
      cleanup = interrupt();
      throw new Error('rebase killed');
    });
    mockedIsRebaseInProgress.mockResolvedValue(false);

    await runSyncMineFlow({ yes: true });
    await cleanup;

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — interrupted (Ctrl+C)'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/two -> develop — not run (interrupted)'),
    );
    expect(spinner.stop).toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
  });
});
