import { execa } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkGlabAuth, listMyOpenMergeRequests } from '@/domains/mr/glab.service.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);

describe('checkGlabAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when execa resolves with exitCode 0', async () => {
    mockedExeca.mockResolvedValueOnce({ exitCode: 0 } as never);

    const result = await checkGlabAuth();

    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith('glab', ['auth', 'status'], { reject: false });
  });

  it('returns false when execa resolves with a non-zero exitCode', async () => {
    mockedExeca.mockResolvedValueOnce({ exitCode: 1 } as never);

    const result = await checkGlabAuth();

    expect(result).toBe(false);
  });
});

describe('listMyOpenMergeRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses MRs and maps snake_case fields to camelCase', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { iid: 12, source_branch: 'feat/foo', target_branch: 'develop' },
        { iid: 13, source_branch: 'feat/bar', target_branch: 'main' },
      ]),
    } as never);

    const result = await listMyOpenMergeRequests();

    expect(result).toEqual([
      { iid: '12', sourceBranch: 'feat/foo', targetBranch: 'develop' },
      { iid: '13', sourceBranch: 'feat/bar', targetBranch: 'main' },
    ]);
    expect(mockedExeca).toHaveBeenCalledWith('glab', [
      'mr',
      'list',
      '--assignee=@me',
      '--output',
      'json',
    ]);
  });

  it('filters out draft merge requests', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { iid: 1, source_branch: 'feat/a', target_branch: 'develop', draft: true },
        { iid: 2, source_branch: 'feat/b', target_branch: 'develop' },
      ]),
    } as never);

    const result = await listMyOpenMergeRequests();

    expect(result).toEqual([{ iid: '2', sourceBranch: 'feat/b', targetBranch: 'develop' }]);
  });

  it('filters out work_in_progress merge requests', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { iid: 1, source_branch: 'feat/a', target_branch: 'develop', work_in_progress: true },
        { iid: 2, source_branch: 'feat/b', target_branch: 'develop' },
      ]),
    } as never);

    const result = await listMyOpenMergeRequests();

    expect(result).toEqual([{ iid: '2', sourceBranch: 'feat/b', targetBranch: 'develop' }]);
  });

  it('returns an empty array when stdout is empty', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never);

    const result = await listMyOpenMergeRequests();

    expect(result).toEqual([]);
  });
});
