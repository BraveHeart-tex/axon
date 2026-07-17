import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  abortCherryPick,
  cherryPick,
  createBranch,
  deleteLocalBranch,
  localBranchExists,
} from '@/domains/git/git.service.js';
import { handleMrUrlGeneration } from '@/domains/mr/flows/mrUrl.flow.js';
import { updateBranchSafely } from '@/domains/release/flows/updateBranchSafely.flow.js';
import { createReleaseAbortedError, isReleaseAbortedError } from '@/domains/release/release.errors.js';
import { executeRelease } from '@/domains/release/release.executor.js';
import type { ReleasePlan } from '@/domains/release/release.types.js';
import { logger } from '@/infra/logger.js';
import { promptRecreateReleaseBranch } from '@/ui/prompts/release.prompts.js';

const spinner = {
  fail: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
};

vi.mock('ora', () => ({
  default: vi.fn(() => spinner),
}));

vi.mock('@/domains/git/git.service.js', () => ({
  abortCherryPick: vi.fn(),
  cherryPick: vi.fn(),
  createBranch: vi.fn(),
  deleteLocalBranch: vi.fn(),
  localBranchExists: vi.fn(),
}));

vi.mock('@/domains/release/flows/updateBranchSafely.flow.js', () => ({
  updateBranchSafely: vi.fn(),
}));

vi.mock('@/domains/mr/flows/mrUrl.flow.js', () => ({
  handleMrUrlGeneration: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/ui/prompts/release.prompts.js', () => ({
  promptRecreateReleaseBranch: vi.fn(),
}));

const mockedAbortCherryPick = vi.mocked(abortCherryPick);
const mockedUpdateBranchSafely = vi.mocked(updateBranchSafely);
const mockedCherryPick = vi.mocked(cherryPick);
const mockedCreateBranch = vi.mocked(createBranch);
const mockedDeleteLocalBranch = vi.mocked(deleteLocalBranch);
const mockedHandleMrUrlGeneration = vi.mocked(handleMrUrlGeneration);
const mockedLocalBranchExists = vi.mocked(localBranchExists);
const mockedPromptRecreateReleaseBranch = vi.mocked(promptRecreateReleaseBranch);

const RELEASE_BRANCH = 'release/ORD-1325';
const FIRST_COMMIT = 'aaa11112222';
const SECOND_COMMIT = 'bbb22223333';
const successfulCherryPick = {} as Awaited<ReturnType<typeof cherryPick>>;

const plan: ReleasePlan = {
  branchTitle: RELEASE_BRANCH,
  commits: [FIRST_COMMIT, SECOND_COMMIT],
  recentCommits: [],
};

describe('executeRelease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    spinner.start.mockReturnValue(spinner);
    mockedUpdateBranchSafely.mockResolvedValue(undefined);
    mockedLocalBranchExists.mockResolvedValue(false);
    mockedPromptRecreateReleaseBranch.mockResolvedValue(false);
    mockedDeleteLocalBranch.mockResolvedValue(undefined);
    mockedCreateBranch.mockResolvedValue(undefined);
    mockedCherryPick.mockResolvedValue(successfulCherryPick);
    mockedAbortCherryPick.mockResolvedValue(undefined);
    mockedHandleMrUrlGeneration.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.mocked(console.log).mockRestore();
  });

  it('updates main before creating the release branch', async () => {
    await executeRelease(plan);

    expect(mockedUpdateBranchSafely).toHaveBeenCalledWith('main');
    expect(mockedCreateBranch).toHaveBeenCalledWith(RELEASE_BRANCH);
    expect(mockedUpdateBranchSafely.mock.invocationCallOrder[0]).toBeLessThan(
      mockedCreateBranch.mock.invocationCallOrder[0]!,
    );
  });

  it('propagates a ReleaseAbortedError from the main update and creates no branch', async () => {
    mockedUpdateBranchSafely.mockRejectedValueOnce(createReleaseAbortedError('Release aborted.'));

    const error = await executeRelease(plan).catch((err: unknown) => err);

    expect(isReleaseAbortedError(error)).toBe(true);
    expect(mockedCreateBranch).not.toHaveBeenCalled();
    expect(mockedCherryPick).not.toHaveBeenCalled();
    expect(mockedHandleMrUrlGeneration).not.toHaveBeenCalled();
  });

  it('creates a release branch when it does not already exist', async () => {
    await executeRelease(plan);

    expect(mockedPromptRecreateReleaseBranch).not.toHaveBeenCalled();
    expect(mockedDeleteLocalBranch).not.toHaveBeenCalled();
    expect(mockedCreateBranch).toHaveBeenCalledWith(RELEASE_BRANCH);
  });

  it('returns early when an existing release branch recreation is declined', async () => {
    mockedLocalBranchExists.mockResolvedValueOnce(true);
    mockedPromptRecreateReleaseBranch.mockResolvedValueOnce(false);

    await executeRelease(plan);

    expect(mockedPromptRecreateReleaseBranch).toHaveBeenCalledWith(RELEASE_BRANCH);
    expect(logger.info).toHaveBeenCalledWith('Release aborted.');
    expect(mockedDeleteLocalBranch).not.toHaveBeenCalled();
    expect(mockedCreateBranch).not.toHaveBeenCalled();
    expect(mockedCherryPick).not.toHaveBeenCalled();
    expect(mockedHandleMrUrlGeneration).not.toHaveBeenCalled();
  });

  it('deletes and recreates an existing release branch when accepted', async () => {
    mockedLocalBranchExists.mockResolvedValueOnce(true);
    mockedPromptRecreateReleaseBranch.mockResolvedValueOnce(true);

    await executeRelease(plan);

    expect(mockedDeleteLocalBranch).toHaveBeenCalledWith(RELEASE_BRANCH);
    expect(mockedCreateBranch).toHaveBeenCalledWith(RELEASE_BRANCH);
    expect(mockedDeleteLocalBranch.mock.invocationCallOrder[0]).toBeLessThan(
      mockedCreateBranch.mock.invocationCallOrder[0]!,
    );
  });

  it('cherry-picks commits in order and generates an MR URL after success', async () => {
    await executeRelease(plan);

    expect(mockedCherryPick).toHaveBeenNthCalledWith(1, [FIRST_COMMIT]);
    expect(mockedCherryPick).toHaveBeenNthCalledWith(2, [SECOND_COMMIT]);
    expect(mockedHandleMrUrlGeneration).toHaveBeenCalledWith({
      sourceBranch: RELEASE_BRANCH,
      targetBranch: 'main',
    });
  });

  it('aborts after the first failed cherry-pick and skips MR URL generation', async () => {
    mockedCherryPick
      .mockResolvedValueOnce(successfulCherryPick)
      .mockRejectedValueOnce(new Error('conflict'));

    await executeRelease(plan);

    expect(mockedCherryPick).toHaveBeenCalledTimes(2);
    expect(mockedAbortCherryPick).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Cherry-pick failed'));
    expect(mockedHandleMrUrlGeneration).not.toHaveBeenCalled();
  });
});
