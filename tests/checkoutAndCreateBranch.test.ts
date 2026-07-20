import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkoutAndCreateBranch } from '@/domains/git/flows/checkoutAndCreateBranch.flow.js';
import { updateBranchFromRemote } from '@/domains/git/flows/updateBranchFromRemote.flow.js';
import { createBranch } from '@/domains/git/git.service.js';

vi.mock('@/domains/git/flows/updateBranchFromRemote.flow.js', () => ({
  updateBranchFromRemote: vi.fn(),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  createBranch: vi.fn(),
}));

const mockedUpdateBranchFromRemote = vi.mocked(updateBranchFromRemote);
const mockedCreateBranch = vi.mocked(createBranch);

type OnDiverged = (branch: string, ahead: number, behind: number) => Promise<boolean>;

describe('checkoutAndCreateBranch', () => {
  let onDiverged: ReturnType<typeof vi.fn<OnDiverged>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockedUpdateBranchFromRemote.mockResolvedValue(undefined);
    mockedCreateBranch.mockResolvedValue(undefined);

    onDiverged = vi.fn<OnDiverged>();
  });

  it('updates the base branch, forwarding the onDiverged callback, then creates the new branch', async () => {
    await checkoutAndCreateBranch('develop', 'feat/JIRA-1', onDiverged);

    expect(mockedUpdateBranchFromRemote).toHaveBeenCalledWith('develop', onDiverged);
    expect(mockedCreateBranch).toHaveBeenCalledWith('feat/JIRA-1');
  });

  it('creates the new branch only after the base update succeeds', async () => {
    const calls: string[] = [];
    mockedUpdateBranchFromRemote.mockImplementation(async () => {
      calls.push('update');
    });
    mockedCreateBranch.mockImplementation(async () => {
      calls.push('create');
    });

    await checkoutAndCreateBranch('develop', 'feat/JIRA-1', onDiverged);

    expect(calls).toEqual(['update', 'create']);
  });

  it('does not create the new branch when the base update fails', async () => {
    mockedUpdateBranchFromRemote.mockRejectedValue(new Error('aborted'));

    const error = await checkoutAndCreateBranch('develop', 'feat/JIRA-1', onDiverged).catch(
      (err: unknown) => err,
    );

    expect((error as Error).message).toBe('aborted');
    expect(mockedCreateBranch).not.toHaveBeenCalled();
  });
});
