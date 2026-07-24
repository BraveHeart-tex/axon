import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateBranchFromRemote } from '@/domains/git/flows/updateBranchFromRemote.flow.js';
import { isBranchUpdateAbortedError } from '@/domains/git/git.errors.js';
import {
  abortRebase,
  checkoutBranch,
  fetchBranchFromRemote,
  getAheadBehind,
  rebaseOntoRemoteBranch,
  remoteTrackingBranchExists,
} from '@/domains/git/git.service.js';

vi.mock('@/domains/git/git.service.js', () => ({
  abortRebase: vi.fn(),
  checkoutBranch: vi.fn(),
  fetchBranchFromRemote: vi.fn(),
  getAheadBehind: vi.fn(),
  rebaseOntoRemoteBranch: vi.fn(),
  remoteTrackingBranchExists: vi.fn(),
}));

const mockedAbortRebase = vi.mocked(abortRebase);
const mockedCheckoutBranch = vi.mocked(checkoutBranch);
const mockedGetAheadBehind = vi.mocked(getAheadBehind);
const mockedFetchBranchFromRemote = vi.mocked(fetchBranchFromRemote);
const mockedRebaseOntoRemoteBranch = vi.mocked(rebaseOntoRemoteBranch);
const mockedRemoteTrackingBranchExists = vi.mocked(remoteTrackingBranchExists);

// updateBranchFromRemote reads ahead/behind vs origin/<branch> in one call.
const mockAheadBehind = (behind: number, ahead: number) => {
  mockedGetAheadBehind.mockResolvedValueOnce({ ahead, behind });
};

describe('updateBranchFromRemote', () => {
  let onDiverged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockedFetchBranchFromRemote.mockResolvedValue(undefined);
    mockedCheckoutBranch.mockResolvedValue(undefined);
    mockedRemoteTrackingBranchExists.mockResolvedValue(true);
    mockedRebaseOntoRemoteBranch.mockResolvedValue(undefined);
    mockedAbortRebase.mockResolvedValue(undefined);

    onDiverged = vi.fn();
  });

  it('fetches and checks out the branch before inspecting divergence', async () => {
    mockAheadBehind(0, 0);

    await updateBranchFromRemote('develop', onDiverged);

    expect(mockedFetchBranchFromRemote).toHaveBeenCalledWith('origin', 'develop');
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('develop');
  });

  it('skips fetching when skipFetch is set but still checks out the branch', async () => {
    mockAheadBehind(0, 0);

    await updateBranchFromRemote('develop', onDiverged, { skipFetch: true });

    expect(mockedFetchBranchFromRemote).not.toHaveBeenCalled();
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('develop');
  });

  it('throws a plain Error when the origin tracking branch is missing', async () => {
    mockedRemoteTrackingBranchExists.mockResolvedValue(false);

    const error = await updateBranchFromRemote('develop', onDiverged).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('origin/develop not found — cannot update develop.');
    expect(isBranchUpdateAbortedError(error)).toBe(false);
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
  });

  it('does nothing when the branch is up to date', async () => {
    mockAheadBehind(0, 0);

    await updateBranchFromRemote('main', onDiverged);

    expect(onDiverged).not.toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
  });

  it('rebases silently when only behind (no prompt)', async () => {
    mockAheadBehind(5, 0);

    await updateBranchFromRemote('main', onDiverged);

    expect(onDiverged).not.toHaveBeenCalled();
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('main');
  });

  it('rebases when diverged and the callback confirms', async () => {
    mockAheadBehind(5, 2);
    onDiverged.mockResolvedValue(true);

    await updateBranchFromRemote('develop', onDiverged);

    expect(onDiverged).toHaveBeenCalledWith('develop', 2, 5);
    expect(mockedRebaseOntoRemoteBranch).toHaveBeenCalledWith('develop');
  });

  it('throws BranchUpdateAbortedError when diverged and the callback declines', async () => {
    mockAheadBehind(5, 2);
    onDiverged.mockResolvedValue(false);

    const error = await updateBranchFromRemote('develop', onDiverged).catch((err: unknown) => err);

    expect(isBranchUpdateAbortedError(error)).toBe(true);
    expect(mockedRebaseOntoRemoteBranch).not.toHaveBeenCalled();
  });

  it('aborts the rebase and throws BranchUpdateAbortedError on conflict', async () => {
    mockAheadBehind(5, 2);
    onDiverged.mockResolvedValue(true);
    mockedRebaseOntoRemoteBranch.mockRejectedValue(new Error('conflict'));

    const error = await updateBranchFromRemote('develop', onDiverged).catch((err: unknown) => err);

    expect(isBranchUpdateAbortedError(error)).toBe(true);
    expect(mockedAbortRebase).toHaveBeenCalled();
  });
});
