import { confirm } from '@inquirer/prompts';
import ora from 'ora';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import {
  abortWorktreeRebase,
  addDetachedWorktree,
  countLocalOnlyCommits,
  createBranchAt,
  deleteBranchesQuietly,
  fetchOriginBranches,
  getCheckedOutBranches,
  getForkPoint,
  getGitCommonDir,
  getGitVersion,
  isAncestor,
  listLocalBranches,
  listRemoteBranches,
  listWorktreePaths,
  pushWithLeases,
  rebaseWorktreeOnto,
  removeWorktree,
  replayOnto,
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
import { acquirePidLock, createLockHeldError } from '@/infra/pidLock.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  abortWorktreeRebase: vi.fn(),
  addDetachedWorktree: vi.fn(),
  countLocalOnlyCommits: vi.fn(),
  createBranchAt: vi.fn(),
  deleteBranchesQuietly: vi.fn(),
  fetchOriginBranches: vi.fn(),
  getCheckedOutBranches: vi.fn(),
  getForkPoint: vi.fn(),
  getGitCommonDir: vi.fn(),
  getGitVersion: vi.fn(),
  isAncestor: vi.fn(),
  listLocalBranches: vi.fn(),
  listRemoteBranches: vi.fn(),
  listWorktreePaths: vi.fn(),
  pruneWorktrees: vi.fn(),
  pushWithLeases: vi.fn(),
  rebaseWorktreeOnto: vi.fn(),
  removeWorktree: vi.fn(),
  replayOnto: vi.fn(),
  resolveCommitSha: vi.fn(),
  updateLocalBranchRef: vi.fn(),
}));

vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

vi.mock('@/infra/pidLock.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infra/pidLock.js')>()),
  acquirePidLock: vi.fn(),
}));

const spinner = {
  fail: vi.fn(),
  info: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  succeed: vi.fn(),
  warn: vi.fn(),
  text: '',
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
const mockedAbortWorktreeRebase = vi.mocked(abortWorktreeRebase);
const mockedAddDetachedWorktree = vi.mocked(addDetachedWorktree);
const mockedCountLocalOnlyCommits = vi.mocked(countLocalOnlyCommits);
const mockedCreateBranchAt = vi.mocked(createBranchAt);
const mockedDeleteBranchesQuietly = vi.mocked(deleteBranchesQuietly);
const mockedFetchOriginBranches = vi.mocked(fetchOriginBranches);
const mockedGetCheckedOutBranches = vi.mocked(getCheckedOutBranches);
const mockedGetForkPoint = vi.mocked(getForkPoint);
const mockedGetGitCommonDir = vi.mocked(getGitCommonDir);
const mockedGetGitVersion = vi.mocked(getGitVersion);
const mockedIsAncestor = vi.mocked(isAncestor);
const mockedListLocalBranches = vi.mocked(listLocalBranches);
const mockedListRemoteBranches = vi.mocked(listRemoteBranches);
const mockedListWorktreePaths = vi.mocked(listWorktreePaths);
const mockedPushWithLeases = vi.mocked(pushWithLeases);
const mockedRebaseWorktreeOnto = vi.mocked(rebaseWorktreeOnto);
const mockedRemoveWorktree = vi.mocked(removeWorktree);
const mockedReplayOnto = vi.mocked(replayOnto);
const mockedResolveCommitSha = vi.mocked(resolveCommitSha);
const mockedUpdateLocalBranchRef = vi.mocked(updateLocalBranchRef);
const mockedCheckGlabAuth = vi.mocked(checkGlabAuth);
const mockedListMyOpenMergeRequests = vi.mocked(listMyOpenMergeRequests);
const mockedAcquirePidLock = vi.mocked(acquirePidLock);

const releaseLock = vi.fn();
const isLockHeld = vi.fn();

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

const quiet = { skipHooks: true };
const gitOptions = { cancelSignal: expect.any(AbortSignal), skipHooks: true };
const pushOptions = (atomic: boolean) => ({ atomic, ...gitOptions });

const shas: Record<string, string> = {
  'refs/remotes/origin/feat/one': 'origin-one',
  'refs/remotes/origin/feat/two': 'origin-two',
  'refs/heads/feat/one': 'local-one',
};

// Replays to `new-<n>` for the MR whose temporary branch is axon-sync/<n>.
const newSha = (branch: string) => `new-${branch.split('/')[1]}`;

type PushUpdate = Parameters<typeof pushWithLeases>[0][number];

const pushResult = (
  updates: PushUpdate[],
  line: (update: PushUpdate) => { flag: string; summary: string } = () => ({
    flag: '+',
    summary: 'forced update',
  }),
) => ({
  ok: true,
  refs: new Map(updates.map((update) => [update.branch, line(update)])),
  stderr: '',
});

const run = (options: Partial<Parameters<typeof runSyncMineFlow>[0]> = {}) =>
  runSyncMineFlow({ yes: true, concurrency: 4, keepWorktrees: false, ...options });

const summaryLines = () =>
  [logger.success, logger.warn, logger.error]
    .flatMap((log) => vi.mocked(log).mock.calls)
    .map(([line]) => line)
    .filter((line) => line.startsWith('  !'));

describe('runSyncMineFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockedCheckGlabAuth.mockResolvedValue(true);
    mockedGetGitVersion.mockResolvedValue({ major: 2, minor: 50 });
    mockedGetGitCommonDir.mockResolvedValue('/repo/.git');
    isLockHeld.mockResolvedValue(true);
    mockedAcquirePidLock.mockResolvedValue({ release: releaseLock, isHeld: isLockHeld });
    mockedListWorktreePaths.mockResolvedValue(['/repo']);
    mockedListLocalBranches.mockResolvedValue([]);
    mockedListMyOpenMergeRequests.mockResolvedValue([]);
    mockedListRemoteBranches.mockImplementation(async (branches) => new Set(branches));
    mockedFetchOriginBranches.mockResolvedValue(undefined);
    mockedIsAncestor.mockResolvedValue(false);
    mockedResolveCommitSha.mockImplementation(async (ref) => shas[ref] ?? '');
    mockedCountLocalOnlyCommits.mockResolvedValue(0);
    mockedGetForkPoint.mockImplementation(async (_upstream, commit) => `fork-${commit}`);
    mockedCreateBranchAt.mockResolvedValue(undefined);
    mockedReplayOnto.mockImplementation(async (_base, _forkPoint, branch) => newSha(branch));
    mockedAddDetachedWorktree.mockResolvedValue(undefined);
    mockedRebaseWorktreeOnto.mockResolvedValue('worktree-sha');
    mockedPushWithLeases.mockImplementation(async (updates) => pushResult(updates));
    mockedGetCheckedOutBranches.mockResolvedValue(new Set());
    mockedUpdateLocalBranchRef.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts when glab is not authenticated', async () => {
    mockedCheckGlabAuth.mockResolvedValueOnce(false);

    await run({ yes: false });

    expect(logger.error).toHaveBeenCalledWith(
      'glab is not installed or not authenticated. Run `glab auth login` first.',
    );
    expect(process.exitCode).toBe(1);
    expect(mockedAcquirePidLock).not.toHaveBeenCalled();
  });

  it('takes the lock in the git common dir and releases it when done', async () => {
    await run();

    expect(mockedAcquirePidLock).toHaveBeenCalledWith('/repo/.git/axon-sync.lock');
    expect(releaseLock).toHaveBeenCalled();
  });

  it('exits 1 without listing MRs when another sync holds the lock', async () => {
    mockedAcquirePidLock.mockRejectedValueOnce(createLockHeldError(4242));

    await run();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Another sync is running (pid 4242)'),
    );
    expect(mockedListMyOpenMergeRequests).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('stops before touching the workspace when the lock is lost right after taking it', async () => {
    isLockHeld.mockResolvedValue(false);

    await run();

    expect(logger.error).toHaveBeenCalledWith(
      'Another sync took over the lock during this run. Wait for it to finish, then rerun.',
    );
    expect(mockedListWorktreePaths).not.toHaveBeenCalled();
    expect(mockedListLocalBranches).not.toHaveBeenCalled();
    expect(mockedListMyOpenMergeRequests).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('pushes nothing and leaves the other run’s branches alone when the lock is lost before the push', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    isLockHeld.mockResolvedValueOnce(true).mockResolvedValue(false);

    await run();

    expect(mockedReplayOnto).toHaveBeenCalledTimes(2);
    expect(mockedPushWithLeases).not.toHaveBeenCalled();
    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(summaryLines()).toEqual([
      expect.stringContaining('!1: feat/one -> develop — not run (lock lost)'),
      expect.stringContaining('!2: feat/two -> develop — not run (lock lost)'),
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      'Another sync took over the lock during this run. Wait for it to finish, then rerun.',
    );
    expect(mockedListLocalBranches).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('removes leftover worktrees and axon-sync branches at startup', async () => {
    mockedListWorktreePaths.mockResolvedValueOnce(['/repo', '/repo/.git/axon-sync/9']);
    mockedListLocalBranches.mockResolvedValueOnce(['axon-sync/9']);

    await run();

    expect(mockedAbortWorktreeRebase).toHaveBeenCalledWith('/repo/.git/axon-sync/9', quiet);
    expect(mockedRemoveWorktree).toHaveBeenCalledExactlyOnceWith('/repo/.git/axon-sync/9', quiet);
    expect(mockedDeleteBranchesQuietly).toHaveBeenCalledWith(['axon-sync/9'], quiet);
    expect(logger.info).toHaveBeenCalledWith('Removed 2 leftover(s) from an earlier sync.');
  });

  it('sweeps axon-sync branches that a parallel delete left behind', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedListLocalBranches
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['axon-sync/1'])
      .mockResolvedValueOnce([]);

    await run();

    expect(mockedListLocalBranches).toHaveBeenCalledTimes(3);
    expect(mockedDeleteBranchesQuietly).toHaveBeenLastCalledWith(['axon-sync/1'], quiet);
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('Could not delete'));
    expect(releaseLock).toHaveBeenCalled();
  });

  it('prints the delete command when an axon-sync branch cannot be removed', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedListLocalBranches
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['axon-sync/1'])
      .mockResolvedValueOnce(['axon-sync/1']);

    await run();

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not delete axon-sync/1. Run `git branch -D axon-sync/1` to remove them.',
    );
    expect(releaseLock).toHaveBeenCalled();
  });

  it('prints no cleanup line when there are no leftovers', async () => {
    await run();

    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('leftover'));
  });

  it('reports when there are no open MRs', async () => {
    await run({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('No open MRs authored by or assigned to you.');
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginBranches).not.toHaveBeenCalled();
  });

  it('aborts sync when confirm is declined', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedConfirm.mockResolvedValueOnce(false);

    await run({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(mockedFetchOriginBranches).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalled();
  });

  it('exits 0 without an error line when the confirm prompt is cancelled', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedConfirm.mockRejectedValueOnce(
      Object.assign(new Error('User force closed the prompt with SIGINT'), {
        name: 'ExitPromptError',
      }),
    );

    await run({ yes: false });

    expect(logger.info).toHaveBeenCalledWith('Sync aborted.');
    expect(logger.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(mockedFetchOriginBranches).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalled();
  });

  it('skips the confirm prompt when yes is true', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await run();

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginBranches).toHaveBeenCalled();
  });

  it('replays origin/<src> in a temporary branch, pushes with an explicit lease and updates the local branch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await run();

    expect(mockedCountLocalOnlyCommits).toHaveBeenCalledWith('origin-one', 'local-one', quiet);
    expect(mockedGetForkPoint).toHaveBeenCalledWith(
      'refs/remotes/origin/develop',
      'origin-one',
      gitOptions,
    );
    expect(mockedCreateBranchAt).toHaveBeenCalledWith('axon-sync/1', 'origin-one', gitOptions);
    expect(mockedReplayOnto).toHaveBeenCalledWith(
      'refs/remotes/origin/develop',
      'fork-origin-one',
      'axon-sync/1',
      gitOptions,
    );
    expect(mockedDeleteBranchesQuietly).toHaveBeenCalledWith(['axon-sync/1'], quiet);
    expect(mockedAddDetachedWorktree).not.toHaveBeenCalled();
    expect(mockedPushWithLeases).toHaveBeenCalledExactlyOnceWith(
      [{ branch: 'feat/one', sha: 'new-1', expectedSha: 'origin-one' }],
      pushOptions(false),
    );
    expect(mockedUpdateLocalBranchRef).toHaveBeenCalledWith(
      'feat/one',
      'new-1',
      'local-one',
      quiet,
    );
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/one'));
    expect(process.exitCode).toBeUndefined();
  });

  it('uses only worktrees below git 2.44', async () => {
    mockedGetGitVersion.mockResolvedValueOnce({ major: 2, minor: 43 });
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await run();

    expect(mockedReplayOnto).not.toHaveBeenCalled();
    expect(mockedCreateBranchAt).not.toHaveBeenCalled();
    expect(mockedAddDetachedWorktree).toHaveBeenCalledWith(
      '/repo/.git/axon-sync/1',
      'origin-one',
      gitOptions,
    );
    expect(mockedPushWithLeases).toHaveBeenCalledWith(
      [{ branch: 'feat/one', sha: 'worktree-sha', expectedSha: 'origin-one' }],
      pushOptions(false),
    );
  });

  it('falls back to a worktree rebase when replay fails', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedReplayOnto.mockResolvedValueOnce(undefined);

    await run();

    expect(mockedAddDetachedWorktree).toHaveBeenCalledWith(
      '/repo/.git/axon-sync/1',
      'origin-one',
      gitOptions,
    );
    expect(mockedRebaseWorktreeOnto).toHaveBeenCalledWith(
      '/repo/.git/axon-sync/1',
      'refs/remotes/origin/develop',
      'fork-origin-one',
      gitOptions,
    );
    expect(mockedRemoveWorktree).toHaveBeenCalledWith('/repo/.git/axon-sync/1', quiet);
    expect(mockedPushWithLeases).toHaveBeenCalledWith(
      [{ branch: 'feat/one', sha: 'worktree-sha', expectedSha: 'origin-one' }],
      pushOptions(false),
    );
    expect(mockedDeleteBranchesQuietly).toHaveBeenCalledWith(['axon-sync/1'], quiet);
  });

  it('aborts a conflicting fallback rebase, marks it failed (conflict) and continues', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedReplayOnto.mockImplementation(async (_base, _forkPoint, branch) =>
      branch === 'axon-sync/1' ? undefined : newSha(branch),
    );
    mockedRebaseWorktreeOnto.mockRejectedValueOnce(
      new Error('Command failed: git rebase\nCONFLICT (content)'),
    );
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await run();

    expect(mockedAbortWorktreeRebase).toHaveBeenCalledWith('/repo/.git/axon-sync/1', quiet);
    expect(mockedRemoveWorktree).toHaveBeenCalledWith('/repo/.git/axon-sync/1', quiet);
    expect(mockedPushWithLeases).toHaveBeenCalledExactlyOnceWith(
      [{ branch: 'feat/two', sha: 'new-2', expectedSha: 'origin-two' }],
      pushOptions(false),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — failed (conflict)'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('git checkout feat/one && axon sb develop'),
      false,
    );
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('CONFLICT (content)'));
    expect(process.exitCode).toBe(1);
    stderr.mockRestore();
  });

  it('keeps the fallback worktree with --keep-worktrees', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedReplayOnto.mockResolvedValueOnce(undefined);

    await run({ keepWorktrees: true });

    expect(mockedAddDetachedWorktree).toHaveBeenCalled();
    expect(mockedRemoveWorktree).not.toHaveBeenCalled();
  });

  it('never creates a local branch when none exists', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrTwo]);

    await run();

    expect(mockedCountLocalOnlyCommits).not.toHaveBeenCalled();
    expect(mockedPushWithLeases).toHaveBeenCalledWith(
      [{ branch: 'feat/two', sha: 'new-2', expectedSha: 'origin-two' }],
      pushOptions(false),
    );
    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
  });

  it('prints a reset hint instead of moving a branch checked out in a worktree', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedGetCheckedOutBranches.mockResolvedValueOnce(new Set(['feat/one']));

    await run();

    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('git reset --keep origin/feat/one'),
    );
  });

  it('skips an MR whose local branch has local-only commits', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedCountLocalOnlyCommits.mockResolvedValueOnce(1);

    await run();

    expect(mockedReplayOnto).toHaveBeenCalledTimes(1);
    expect(mockedPushWithLeases).toHaveBeenCalledExactlyOnceWith(
      [{ branch: 'feat/two', sha: 'new-2', expectedSha: 'origin-two' }],
      pushOptions(false),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — skipped (local-only commits)'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('fails the MR without pushing when the local-only count cannot be computed', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedCountLocalOnlyCommits.mockRejectedValueOnce(new Error('Failed to count commits'));

    await run();

    expect(mockedReplayOnto).not.toHaveBeenCalled();
    expect(mockedPushWithLeases).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — failed (Failed to count commits)'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a pushed MR as synced when updating the local branch fails', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedGetCheckedOutBranches.mockRejectedValueOnce(new Error('worktree list failed'));

    await run();

    expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('local feat/one was not updated: worktree list failed'),
    );
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/one'));
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    ['fork', mr('1', 'feat/fork', { sourceProjectId: 99 })],
    ['draft', mr('1', 'feat/draft', { draft: true })],
    ['guardrail', mr('1', 'release/1.2')],
    ['guardrail', mr('1', 'feat/hotfix', { targetBranch: 'main' })],
  ])('reports a %s MR as skipped without touching git', async (reason, skipped) => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([skipped]);

    await run({ yes: false });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `!1: ${skipped.sourceBranch} -> ${skipped.targetBranch} — skipped (${reason})`,
      ),
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedListRemoteBranches).not.toHaveBeenCalled();
    expect(mockedReplayOnto).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('prints the axon sb command for a guardrail-skipped MR', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mr('1', 'release/1.2')]);

    await run();

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

    await run();

    expect(mockedListRemoteBranches).toHaveBeenCalledWith(
      ['feat/one', 'develop', 'feat/two', 'feat/gone'],
      gitOptions,
    );
    expect(mockedFetchOriginBranches).toHaveBeenCalledWith(
      ['feat/one', 'develop', 'feat/two'],
      gitOptions,
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!3: feat/gone -> develop — failed (origin/feat/gone not found)'),
    );
    expect(mockedReplayOnto).toHaveBeenCalledTimes(2);
    expect(mockedPushWithLeases).toHaveBeenCalledExactlyOnceWith(
      [
        { branch: 'feat/one', sha: 'new-1', expectedSha: 'origin-one' },
        { branch: 'feat/two', sha: 'new-2', expectedSha: 'origin-two' },
      ],
      pushOptions(false),
    );
    expect(process.exitCode).toBe(1);
  });

  it('never replays or pushes an up-to-date MR', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedIsAncestor.mockResolvedValueOnce(true);

    await run();

    expect(mockedIsAncestor).toHaveBeenCalledWith(
      'refs/remotes/origin/develop',
      'refs/remotes/origin/feat/one',
      gitOptions,
    );
    expect(mockedCreateBranchAt).not.toHaveBeenCalled();
    expect(mockedReplayOnto).not.toHaveBeenCalled();
    expect(mockedAddDetachedWorktree).not.toHaveBeenCalled();
    expect(mockedPushWithLeases).not.toHaveBeenCalled();
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — up-to-date'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  describe('stacks', () => {
    const parent = mr('1', 'feat/one');
    const child = mr('2', 'feat/two', { targetBranch: 'feat/one' });

    it('rebases the child onto the parent’s new SHA and pushes the stack atomically', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([child, parent, mr('3', 'feat/three')]);

      await run();

      expect(mockedIsAncestor).toHaveBeenCalledWith(
        'new-1',
        'refs/remotes/origin/feat/two',
        gitOptions,
      );
      expect(mockedGetForkPoint).toHaveBeenCalledWith(
        'refs/remotes/origin/feat/one',
        'origin-two',
        gitOptions,
      );
      expect(mockedReplayOnto).toHaveBeenCalledWith(
        'new-1',
        'fork-origin-two',
        'axon-sync/2',
        gitOptions,
      );
      expect(mockedPushWithLeases).toHaveBeenCalledWith(
        [{ branch: 'feat/three', sha: 'new-3', expectedSha: '' }],
        pushOptions(false),
      );
      expect(mockedPushWithLeases).toHaveBeenCalledWith(
        [
          { branch: 'feat/two', sha: 'new-2', expectedSha: 'origin-two' },
          { branch: 'feat/one', sha: 'new-1', expectedSha: 'origin-one' },
        ],
        pushOptions(true),
      );
      expect(process.exitCode).toBeUndefined();
    });

    it('rebases the child onto origin/<parent> when the parent is up to date', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([parent, child]);
      mockedIsAncestor.mockImplementation(async (_base, source) => source.endsWith('feat/one'));

      await run();

      expect(mockedReplayOnto).toHaveBeenCalledExactlyOnceWith(
        'refs/remotes/origin/feat/one',
        'fork-origin-two',
        'axon-sync/2',
        gitOptions,
      );
      expect(mockedPushWithLeases).toHaveBeenCalledExactlyOnceWith(
        [{ branch: 'feat/two', sha: 'new-2', expectedSha: 'origin-two' }],
        pushOptions(true),
      );
    });

    it('treats a filtered-out parent like any other target', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([
        mr('1', 'feat/one', { draft: true }),
        child,
      ]);

      await run();

      expect(mockedReplayOnto).toHaveBeenCalledExactlyOnceWith(
        'refs/remotes/origin/feat/one',
        'fork-origin-two',
        'axon-sync/2',
        gitOptions,
      );
      expect(mockedPushWithLeases).toHaveBeenCalledWith(expect.any(Array), pushOptions(false));
    });

    it('skips the child when the parent fails', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([parent, child]);
      mockedReplayOnto.mockResolvedValueOnce(undefined);
      mockedRebaseWorktreeOnto.mockRejectedValueOnce(new Error('conflict'));

      await run();

      expect(mockedReplayOnto).toHaveBeenCalledTimes(1);
      expect(mockedPushWithLeases).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('!2: feat/two -> feat/one — skipped (parent failed)'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('skips every descendant of a failed parent, not just its children', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([
        parent,
        child,
        mr('3', 'feat/three', { targetBranch: 'feat/two' }),
      ]);
      mockedReplayOnto.mockResolvedValueOnce(undefined);
      mockedRebaseWorktreeOnto.mockRejectedValueOnce(new Error('conflict'));

      await run();

      expect(mockedReplayOnto).toHaveBeenCalledTimes(1);
      expect(mockedPushWithLeases).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('!3: feat/three -> feat/two — skipped (parent failed)'),
      );
    });

    it('fails MRs in a cycle and skips their children', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([
        mr('1', 'feat/one', { targetBranch: 'feat/two' }),
        mr('2', 'feat/two', { targetBranch: 'feat/one' }),
        mr('3', 'feat/three', { targetBranch: 'feat/two' }),
      ]);

      await run();

      expect(mockedReplayOnto).not.toHaveBeenCalled();
      expect(summaryLines().map((line) => line.split(' — ')[1])).toEqual([
        'skipped (parent failed)',
        'failed (cycle)',
        'failed (cycle)',
      ]);
      expect(process.exitCode).toBe(1);
    });

    it('marks the rest of a stack skipped (stack rejected) when one lease is stale', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([parent, child]);
      mockedPushWithLeases.mockImplementationOnce(async (updates) => ({
        ...pushResult(updates, ({ branch }) =>
          branch === 'feat/two'
            ? { flag: '!', summary: '[rejected] (stale info)' }
            : { flag: '!', summary: '[rejected] (atomic push failed)' },
        ),
        ok: false,
      }));

      await run();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('!2: feat/two -> feat/one — failed (remote changed)'),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('!1: feat/one -> develop — skipped (stack rejected)'),
      );
      expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  it('rebases at most --concurrency MRs at once', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([
      mr('1', 'feat/a'),
      mr('2', 'feat/b'),
      mr('3', 'feat/c'),
      mr('4', 'feat/d'),
      mr('5', 'feat/e'),
    ]);
    let active = 0;
    let peak = 0;
    mockedReplayOnto.mockImplementation(async (_base, _forkPoint, branch) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return newSha(branch);
    });

    await run({ concurrency: 2 });

    expect(peak).toBe(2);
    expect(mockedReplayOnto).toHaveBeenCalledTimes(5);
  });

  it('counts an up-to-date push line as synced', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedPushWithLeases.mockImplementationOnce(async (updates) =>
      pushResult(updates, () => ({ flag: '=', summary: '[up to date]' })),
    );

    await run();

    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — synced'),
    );
  });

  it('marks an MR failed (remote changed) when its lease is stale in a batched push', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedPushWithLeases.mockImplementationOnce(async (updates) => ({
      ...pushResult(updates, ({ branch }) =>
        branch === 'feat/one'
          ? { flag: '!', summary: '[rejected] (stale info)' }
          : { flag: '+', summary: 'forced update' },
      ),
      ok: false,
    }));

    await run();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — failed (remote changed)'),
    );
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/two -> develop — synced'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('retries a push once after a network error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedPushWithLeases.mockResolvedValueOnce({
      ok: false,
      refs: new Map(),
      stderr: 'fatal: unable to access origin: Could not resolve host: gitlab.com',
    });

    const flow = run();
    await vi.waitFor(() => expect(mockedPushWithLeases).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    await flow;

    expect(mockedPushWithLeases).toHaveBeenCalledTimes(2);
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — synced'),
    );
  });

  it('does not retry a push that failed for another reason and shows its output', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedPushWithLeases.mockResolvedValueOnce({
      ok: false,
      refs: new Map(),
      stderr: 'fatal: permission denied',
    });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await run();

    expect(mockedPushWithLeases).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed (push failed)'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    expect(process.exitCode).toBe(1);
    stderr.mockRestore();
  });

  it('tells the user to set up credentials when the push needs a prompt', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
    mockedPushWithLeases.mockResolvedValueOnce({
      ok: false,
      refs: new Map(),
      stderr: "fatal: could not read Username for 'https://gitlab.com': terminal prompts disabled",
    });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await run();

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

    await run();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Set up a credential helper or SSH agent'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('shows progress as [i/N] for every MR it syncs', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedIsAncestor.mockResolvedValueOnce(true);

    await run({ concurrency: 1 });

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
    mockedReplayOnto.mockResolvedValueOnce(undefined);
    mockedRebaseWorktreeOnto.mockRejectedValueOnce(new Error('conflict'));

    await run();

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

    await run();

    expect(mockedReplayOnto).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/one -> develop — not run (fetch failed)'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/draft -> develop — skipped (draft)'),
    );
    expect(logger.error).toHaveBeenCalledWith('Failed to fetch from origin: boom');
    expect(process.exitCode).toBe(1);
  });

  describe('Ctrl+C', () => {
    const interruptOn = () => {
      const exit = vi.fn();
      const interrupt = createInterruptHandler({ exit, stdout: vi.fn(), stderr: vi.fn() });
      const state: { cleanup?: Promise<void> } = {};
      return { exit, state, trigger: () => (state.cleanup = interrupt()) };
    };

    it('marks every MR not run (interrupted) when it lands during the fetch', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
      const { state, trigger } = interruptOn();
      mockedFetchOriginBranches.mockImplementationOnce(async () => {
        trigger();
        throw new Error('fetch killed');
      });

      await run();
      await state.cleanup;

      expect(mockedReplayOnto).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('!1: feat/one -> develop — not run (interrupted)'),
      );
      expect(logger.error).not.toHaveBeenCalledWith('fetch killed');
      expect(releaseLock).toHaveBeenCalled();
      expect(process.exitCode).toBe(130);
    });

    it('cancels queued MRs, cleans up and exits 130 when it lands mid-rebase', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
      const { exit, state, trigger } = interruptOn();
      mockedReplayOnto.mockImplementationOnce(async () => {
        mockedListWorktreePaths.mockResolvedValueOnce(['/repo', '/repo/.git/axon-sync/1']);
        mockedListLocalBranches.mockResolvedValueOnce(['axon-sync/1']);
        trigger();
        return undefined;
      });

      await run({ concurrency: 1 });
      await state.cleanup;

      expect(mockedReplayOnto).toHaveBeenCalledTimes(1);
      expect(mockedAddDetachedWorktree).not.toHaveBeenCalled();
      expect(mockedPushWithLeases).not.toHaveBeenCalled();
      expect(mockedRemoveWorktree).toHaveBeenCalledWith('/repo/.git/axon-sync/1', quiet);
      expect(mockedDeleteBranchesQuietly).toHaveBeenCalledWith(['axon-sync/1'], quiet);
      expect(releaseLock).toHaveBeenCalled();
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

    it('leaves the workspace to the run that took over the lock', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);
      const { state, trigger } = interruptOn();
      mockedReplayOnto.mockImplementationOnce(async () => {
        isLockHeld.mockResolvedValue(false);
        trigger();
        return undefined;
      });

      await run();
      await state.cleanup;

      expect(mockedListWorktreePaths).toHaveBeenCalledTimes(1);
      expect(mockedListLocalBranches).toHaveBeenCalledTimes(1);
      expect(releaseLock).toHaveBeenCalled();
      expect(process.exitCode).toBe(130);
    });

    it('marks the MRs being pushed interrupted (rerun to verify)', async () => {
      mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
      mockedIsAncestor.mockImplementation(async (_base, source) => source.endsWith('feat/two'));
      const { state, trigger } = interruptOn();
      mockedPushWithLeases.mockImplementationOnce(async () => {
        trigger();
        return { ok: false, refs: new Map(), stderr: '' };
      });

      await run();
      await state.cleanup;

      expect(mockedUpdateLocalBranchRef).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('!1: feat/one -> develop — interrupted (rerun to verify)'),
      );
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('!2: feat/two -> develop — up-to-date'),
      );
      expect(process.exitCode).toBe(130);
    });
  });
});
