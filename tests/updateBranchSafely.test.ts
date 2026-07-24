import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  abortRebase,
  checkoutBranch,
  fetchBranchFromRemote,
  getAheadBehind,
  rebaseOntoRemoteBranch,
  remoteTrackingBranchExists,
} from '@/domains/git/git.service.js';
import { updateBranchSafely } from '@/domains/release/flows/updateBranchSafely.flow.js';
import { isReleaseAbortedError } from '@/domains/release/release.errors.js';
import { promptRebaseDivergedBranch } from '@/ui/prompts/git.prompts.js';

vi.mock('@/domains/git/git.service.js', () => ({
  abortRebase: vi.fn(),
  checkoutBranch: vi.fn(),
  fetchBranchFromRemote: vi.fn(),
  getAheadBehind: vi.fn(),
  rebaseOntoRemoteBranch: vi.fn(),
  remoteTrackingBranchExists: vi.fn(),
}));

vi.mock('@/ui/prompts/git.prompts.js', () => ({
  promptRebaseDivergedBranch: vi.fn(),
}));

const mockedAbortRebase = vi.mocked(abortRebase);
const mockedCheckoutBranch = vi.mocked(checkoutBranch);
const mockedGetAheadBehind = vi.mocked(getAheadBehind);
const mockedFetchBranchFromRemote = vi.mocked(fetchBranchFromRemote);
const mockedRebaseOntoRemoteBranch = vi.mocked(rebaseOntoRemoteBranch);
const mockedRemoteTrackingBranchExists = vi.mocked(remoteTrackingBranchExists);
const mockedPromptRebaseDivergedBranch = vi.mocked(promptRebaseDivergedBranch);

// updateBranchSafely reads ahead/behind vs origin/<branch> in one call.
const mockAheadBehind = (behind: number, ahead: number) => {
  mockedGetAheadBehind.mockResolvedValueOnce({ ahead, behind });
};

describe('updateBranchSafely', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedFetchBranchFromRemote.mockResolvedValue(undefined);
    mockedCheckoutBranch.mockResolvedValue(undefined);
    mockedRemoteTrackingBranchExists.mockResolvedValue(true);
    mockedRebaseOntoRemoteBranch.mockResolvedValue(undefined);
    mockedAbortRebase.mockResolvedValue(undefined);
  });

  it('fetches and checks out the branch before inspecting divergence', async () => {
    mockAheadBehind(0, 0);

    await updateBranchSafely('develop');

    expect(mockedFetchBranchFromRemote).toHaveBeenCalledWith('origin', 'develop');
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('develop');
  });

  it('skips fetching when skipFetch is set but still checks out the branch', async () => {
    mockAheadBehind(0, 0);

    await updateBranchSafely('main', { skipFetch: true });

    expect(mockedFetchBranchFromRemote).not.toHaveBeenCalled();
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('main');
  });

  it('throws when the origin tracking branch is missing', async () => {
    mockedRemoteTrackingBranchExists.mockResolvedValue(false);

    await expect(updateBranchSafely('develop')).rejects.toThrow(
      'origin/develop not found — cannot update develop.',
    );
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
  });

  it('does nothing when the branch is up to date', async () => {
    mockAheadBehind(0, 0);

    await updateBranchSafely('main');

    expect(mockedPromptRebaseDivergedBranch).not.toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
  });

  it('rebases silently when only behind (no prompt)', async () => {
    mockAheadBehind(5, 0);

    await updateBranchSafely('main');

    expect(mockedPromptRebaseDivergedBranch).not.toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('main');
  });

  it('rebases when diverged and the user confirms', async () => {
    mockAheadBehind(5, 2);
    mockedPromptRebaseDivergedBranch.mockResolvedValue(true);

    await updateBranchSafely('develop');

    expect(mockedPromptRebaseDivergedBranch).toHaveBeenCalledWith('develop', 2, 5);
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('develop');
  });

  it('throws ReleaseAbortedError when diverged and the user declines', async () => {
    mockAheadBehind(5, 2);
    mockedPromptRebaseDivergedBranch.mockResolvedValue(false);

    const error = await updateBranchSafely('develop').catch((err: unknown) => err);

    expect(isReleaseAbortedError(error)).toBe(true);
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
  });

  it('aborts the rebase and throws ReleaseAbortedError on conflict', async () => {
    mockAheadBehind(5, 2);
    mockedPromptRebaseDivergedBranch.mockResolvedValue(true);
    mockedRebaseOntoRemoteBranch.mockRejectedValue(new Error('conflict'));

    const error = await updateBranchSafely('develop').catch((err: unknown) => err);

    expect(isReleaseAbortedError(error)).toBe(true);
    expect(mockedAbortRebase).toHaveBeenCalled();
  });
});
