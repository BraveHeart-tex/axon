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

const raw = (iid: number, overrides: Record<string, unknown> = {}) => ({
  iid,
  source_branch: `feat/${iid}`,
  target_branch: 'develop',
  source_project_id: 7,
  target_project_id: 7,
  ...overrides,
});

const glabPages = (pages: Record<string, unknown[][]>) =>
  mockedExeca.mockImplementation((async (_file: string, args: string[]) => {
    const filter = args[2]!;
    const page = Number(args[args.indexOf('--page') + 1]);
    return { stdout: JSON.stringify(pages[filter]?.[page - 1] ?? []) };
  }) as never);

const listArgs = (filter: string, page: number) => [
  'mr',
  'list',
  filter,
  '--per-page',
  '100',
  '--page',
  String(page),
  '--output',
  'json',
];

describe('listMyOpenMergeRequests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses MRs and maps snake_case fields to camelCase', async () => {
    glabPages({
      '--assignee=@me': [[raw(12, { target_branch: 'main', source_project_id: 9 })]],
    });

    const result = await listMyOpenMergeRequests();

    expect(result).toEqual([
      {
        iid: '12',
        sourceBranch: 'feat/12',
        targetBranch: 'main',
        sourceProjectId: 9,
        targetProjectId: 7,
        draft: false,
      },
    ]);
  });

  it('lists assigned and authored MRs in parallel and deduplicates them by iid', async () => {
    glabPages({
      '--assignee=@me': [[raw(1), raw(2)]],
      '--author=@me': [[raw(2), raw(3)]],
    });

    const result = await listMyOpenMergeRequests();

    expect(result.map((mr) => mr.iid)).toEqual(['1', '2', '3']);
    expect(mockedExeca).toHaveBeenCalledWith('glab', listArgs('--assignee=@me', 1));
    expect(mockedExeca).toHaveBeenCalledWith('glab', listArgs('--author=@me', 1));
  });

  it('keeps fetching pages until one comes back short', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => raw(index + 1));
    glabPages({ '--assignee=@me': [fullPage, [raw(101), raw(102)]] });

    const result = await listMyOpenMergeRequests();

    expect(result).toHaveLength(102);
    expect(mockedExeca).toHaveBeenCalledWith('glab', listArgs('--assignee=@me', 2));
    expect(mockedExeca).not.toHaveBeenCalledWith('glab', listArgs('--assignee=@me', 3));
    expect(mockedExeca).not.toHaveBeenCalledWith('glab', listArgs('--author=@me', 2));
  });

  it('keeps draft and work_in_progress MRs and flags them as drafts', async () => {
    glabPages({
      '--assignee=@me': [[raw(1, { draft: true }), raw(2, { work_in_progress: true }), raw(3)]],
    });

    const result = await listMyOpenMergeRequests();

    expect(result.map((mr) => mr.draft)).toEqual([true, true, false]);
  });

  it('returns an empty array when stdout is empty', async () => {
    mockedExeca.mockResolvedValue({ stdout: '' } as never);

    const result = await listMyOpenMergeRequests();

    expect(result).toEqual([]);
  });

  it('explains what to do when glab returns output that is not JSON', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'Unknown flag: --output' } as never);

    await expect(listMyOpenMergeRequests()).rejects.toThrow(
      /not JSON\. Update glab and rerun\.\nUnknown flag: --output/,
    );
  });

  it('stops paging after 50 full pages instead of looping forever', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => raw(index + 1));
    mockedExeca.mockResolvedValue({ stdout: JSON.stringify(fullPage) } as never);

    await expect(listMyOpenMergeRequests()).rejects.toThrow(/returned more than 5000 MRs/);
    expect(mockedExeca).not.toHaveBeenCalledWith('glab', listArgs('--assignee=@me', 51));
  });

  it('explains what is needed and includes glab stderr when glab mr list fails', async () => {
    mockedExeca.mockRejectedValue(
      Object.assign(new Error('Command failed'), {
        stderr: 'none of the git remotes point to a GitLab host',
      }),
    );

    await expect(listMyOpenMergeRequests()).rejects.toThrow(
      /GitLab origin remote.*glab auth login[\s\S]*none of the git remotes point to a GitLab host/,
    );
  });
});
