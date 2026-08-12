import { confirm } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { performRebaseAndPush } from '@/domains/branch/syncBranch.flow.js';
import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import {
  checkoutBranch,
  checkoutOrCreateTrackingBranch,
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
} from '@/domains/git/git.service.js';
import { checkGlabAuth, listMyOpenMergeRequests } from '@/domains/mr/glab.service.js';
import { logger } from '@/infra/logger.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  checkoutBranch: vi.fn(),
  checkoutOrCreateTrackingBranch: vi.fn(),
  fetchOriginPrune: vi.fn(),
  getCurrentBranchNameForWorktree: vi.fn(),
  isWorkingTreeDirty: vi.fn(),
}));

vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

vi.mock('@/domains/branch/syncBranch.flow.js', () => ({
  performRebaseAndPush: vi.fn(),
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
const mockedCheckoutBranch = vi.mocked(checkoutBranch);
const mockedCheckoutOrCreateTrackingBranch = vi.mocked(checkoutOrCreateTrackingBranch);
const mockedFetchOriginPrune = vi.mocked(fetchOriginPrune);
const mockedGetCurrentBranchNameForWorktree = vi.mocked(getCurrentBranchNameForWorktree);
const mockedIsWorkingTreeDirty = vi.mocked(isWorkingTreeDirty);
const mockedCheckGlabAuth = vi.mocked(checkGlabAuth);
const mockedListMyOpenMergeRequests = vi.mocked(listMyOpenMergeRequests);
const mockedPerformRebaseAndPush = vi.mocked(performRebaseAndPush);

const mrOne = { iid: '1', sourceBranch: 'feat/one', targetBranch: 'develop' };
const mrTwo = { iid: '2', sourceBranch: 'feat/two', targetBranch: 'develop' };

describe('runSyncMineFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockedCheckGlabAuth.mockResolvedValue(true);
    mockedIsWorkingTreeDirty.mockResolvedValue(false);
    mockedGetCurrentBranchNameForWorktree.mockResolvedValue('feat/current');
    mockedListMyOpenMergeRequests.mockResolvedValue([]);
    mockedFetchOriginPrune.mockResolvedValue(undefined);
    mockedCheckoutOrCreateTrackingBranch.mockResolvedValue(undefined);
    mockedCheckoutBranch.mockResolvedValue(undefined);
    mockedPerformRebaseAndPush.mockResolvedValue(undefined);
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
    expect(mockedCheckoutOrCreateTrackingBranch).not.toHaveBeenCalled();
  });

  it('skips the confirm prompt when yes is true', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne]);

    await runSyncMineFlow({ yes: true });

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedFetchOriginPrune).toHaveBeenCalled();
    expect(mockedCheckoutOrCreateTrackingBranch).toHaveBeenCalledWith('feat/one');
  });

  it('continues past a failed MR and records results, restoring the original branch once', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedPerformRebaseAndPush.mockRejectedValueOnce(new Error('rebase failed'));
    mockedPerformRebaseAndPush.mockResolvedValueOnce(undefined);

    await runSyncMineFlow({ yes: true });

    expect(mockedPerformRebaseAndPush).toHaveBeenCalledTimes(2);
    expect(mockedPerformRebaseAndPush).toHaveBeenNthCalledWith(1, 'feat/one', 'develop', {
      interactive: false,
    });
    expect(mockedPerformRebaseAndPush).toHaveBeenNthCalledWith(2, 'feat/two', 'develop', {
      interactive: false,
    });
    expect(mockedCheckoutBranch).toHaveBeenCalledTimes(1);
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('feat/current');
    expect(process.exitCode).toBe(1);
  });

  it('keeps exitCode undefined when all MRs succeed and still restores the original branch', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);

    await runSyncMineFlow({ yes: true });

    expect(mockedCheckoutBranch).toHaveBeenCalledTimes(1);
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('feat/current');
    expect(process.exitCode).toBeUndefined();
  });

  it('records a checkout failure as failed for that MR and continues to the next one', async () => {
    mockedListMyOpenMergeRequests.mockResolvedValueOnce([mrOne, mrTwo]);
    mockedCheckoutOrCreateTrackingBranch.mockRejectedValueOnce(new Error('checkout failed'));

    await runSyncMineFlow({ yes: true });

    expect(mockedCheckoutOrCreateTrackingBranch).toHaveBeenCalledTimes(2);
    expect(mockedPerformRebaseAndPush).toHaveBeenCalledTimes(1);
    expect(mockedPerformRebaseAndPush).toHaveBeenCalledWith('feat/two', 'develop', {
      interactive: false,
    });
    expect(process.exitCode).toBe(1);
    expect(mockedCheckoutBranch).toHaveBeenCalledTimes(1);
  });
});
