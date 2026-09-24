import { execa } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGitCommonDir, getGitVersion } from '@/domains/git/git.service.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);

const failed = (stderr: string) =>
  ({ failed: true, exitCode: 128, stdout: '', stderr }) as unknown as Awaited<
    ReturnType<typeof execa>
  >;

describe('git repo info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses the git version', async () => {
    mockedExeca.mockResolvedValueOnce({
      failed: false,
      exitCode: 0,
      stdout: 'git version 2.50.1 (Apple Git-155)',
    } as unknown as Awaited<ReturnType<typeof execa>>);

    await expect(getGitVersion()).resolves.toEqual({ major: 2, minor: 50 });
  });

  it('says to install git when it cannot run', async () => {
    mockedExeca.mockResolvedValueOnce(failed('spawn git ENOENT'));

    await expect(getGitVersion()).rejects.toThrow(
      'Could not run git. Install git and make sure it is on your PATH, then rerun.',
    );
  });

  it('says to run from a checkout outside a git repository', async () => {
    mockedExeca.mockResolvedValueOnce(failed('fatal: not a git repository'));

    await expect(getGitCommonDir()).rejects.toThrow(
      'Not inside a git repository. Run this from your project checkout.',
    );
  });
});
