import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { confirm, input } from '@inquirer/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import { logger } from '@/infra/logger.js';

import { commitFile, createTestRepos, git, type TestRepos } from './helpers/gitRepos.js';
import { projectContext } from './helpers/projectContext.js';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn(), input: vi.fn() }));
vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn((file, args, options) =>
      file === 'glab' ? glab(args) : actual.execa(file, args, options),
    ),
  };
});
const glab = vi.hoisted(() => vi.fn());
const context = projectContext({
  version: 1,
  flow: 'classified',
  classified: { mainBranch: 'production', developBranch: 'staging' },
});
let repos: TestRepos;
const head = () => git(repos.user, 'rev-parse', 'HEAD');
const remote = () => git(repos.origin, 'rev-parse', 'refs/heads/feat/work');
const run = (target?: string) => runSyncBranchFlow(target, context);
const subjects = () => git(repos.origin, 'log', '--format=%s', 'production..feat/work');

describe('Classified plain sb in temp repos', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    glab.mockRejectedValue(new Error('unavailable'));
    vi.mocked(input).mockImplementation(async (options) => String(options.default));
    vi.mocked(confirm).mockResolvedValue(false);
    repos = await createTestRepos();
    await git(repos.user, 'branch', 'production');
    await git(repos.user, 'branch', 'staging');
    await git(repos.user, 'push', '-q', 'origin', 'production', 'staging');
    await git(repos.user, 'checkout', '-q', '-b', 'feat/work', 'production');
    await commitFile(repos.user, 'work.txt', 'work\n');
    await git(repos.user, 'push', '-q', 'origin', 'feat/work');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await repos.cleanup();
    process.exitCode = undefined;
  });

  it('refuses configured develop explicitly', async () => {
    const before = await remote();
    const error = vi.spyOn(logger, 'error');
    await run('staging');
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('never sync onto staging'));
    expect(await remote()).toBe(before);
  });

  it('rejects a mocked MR into configured develop', async () => {
    glab
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ iid: 42, target_branch: 'staging' }) });
    const error = vi.spyOn(logger, 'error');
    await run('production');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Retarget !42 to production'));
    expect(glab).toHaveBeenLastCalledWith(['mr', 'view', 'feat/work', '-F', 'json']);
    expect(process.exitCode).toBe(1);
  });

  it.each(['trailer', 'reachable'])(
    'refuses %s develop commits with recovery commands',
    async (kind) => {
      await git(
        repos.user,
        'commit',
        '--allow-empty',
        '-m',
        kind === 'trailer' ? 'staging change\n\nStaging-MR: 42' : 'staging change',
      );
      const sha = await head();
      if (kind === 'reachable') await git(repos.user, 'push', '-q', 'origin', 'HEAD:staging');
      const error = vi.spyOn(logger, 'error');
      const before = await remote();
      await run('production');
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining(sha.slice(0, 12)));
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('git rebase -i origin/production'),
      );
      expect(await remote()).toBe(before);
    },
  );

  it('offers configured main when no parent exists and skips unavailable glab', async () => {
    await run();
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ default: 'production' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it.each(['unauthenticated', 'no MR', 'malformed', 'null', 'main MR'])(
    'best-effort glab: %s',
    async (scenario) => {
      if (scenario === 'unauthenticated') glab.mockResolvedValue({ exitCode: 1 });
      else {
        glab.mockResolvedValueOnce({ exitCode: 0 });
        if (scenario === 'no MR') glab.mockRejectedValueOnce(new Error('no MR'));
        else
          glab.mockResolvedValueOnce({
            stdout:
              scenario === 'malformed'
                ? 'invalid JSON'
                : scenario === 'null'
                  ? 'null'
                  : JSON.stringify({ iid: 1, target_branch: 'production' }),
          });
      }
      await run('production');
      expect(process.exitCode).toBeUndefined();
      expect(await remote()).toBe(await head());
    },
  );

  it('rebases onto newer configured main and pushes without an upstream', async () => {
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'production');
    const mainSha = await commitFile(repos.other, 'main.txt', 'advanced\n');
    await git(repos.other, 'push', '-q', 'origin', 'production');
    await run('production');
    expect(await git(repos.origin, 'merge-base', 'production', 'feat/work')).toBe(mainSha);
    expect(await remote()).toBe(await head());
    expect(process.exitCode).toBeUndefined();
  });

  it('aborts a conflicting rebase when fallback confirmation is cancelled', async () => {
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'production');
    await commitFile(repos.other, 'work.txt', 'conflicting\n');
    await git(repos.other, 'push', '-q', 'origin', 'production');
    vi.mocked(confirm).mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { name: 'ExitPromptError' }),
    );
    const before = await head();
    await run('production');
    expect(await head()).toBe(before);
    expect(await git(repos.user, 'branch', '--show-current')).toBe('feat/work');
    expect(process.exitCode).toBeUndefined();
  });

  it('detects the nearest teammate parent and accepts it explicitly', async () => {
    await git(repos.user, 'push', '-q', 'origin', 'HEAD:teammate/older');
    await commitFile(repos.user, 'parent.txt', 'parent\n');
    await git(repos.user, 'push', '-q', 'origin', 'HEAD:teammate/parent');
    await commitFile(repos.user, 'child.txt', 'child\n');
    const info = vi.spyOn(logger, 'info');
    await run();
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ default: 'teammate/parent' }));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('contains teammate/parent head'));
    await run('teammate/parent');
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it.each([false, true])('foreign-author confirmation: %s', async (proceed) => {
    await git(
      repos.user,
      '-c',
      'user.email=teammate@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'foreign work',
    );
    const before = await remote();
    vi.mocked(confirm).mockResolvedValue(proceed);
    await run('production');
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        default: false,
        message: expect.stringContaining('1 commits by other authors'),
      }),
    );
    expect(await remote()).toBe(proceed ? await head() : before);
    expect(process.exitCode).toBeUndefined();
  });

  it.each(['fixup', 'squash', 'amend'])('autosquashes %s and pushes', async (kind) => {
    const target = await head();
    await writeFile(path.join(repos.user, 'work.txt'), 'corrected\n');
    await git(repos.user, 'add', 'work.txt');
    if (kind === 'amend') await git(repos.user, 'commit', `--fixup=amend:${target}`, '--no-edit');
    else await git(repos.user, 'commit', '-m', `${kind}! edit work.txt`, '-m', 'correction body');
    await run('production');
    expect(await subjects()).toBe('edit work.txt');
    expect(await git(repos.origin, 'show', 'feat/work:work.txt')).toBe('corrected');
    if (kind === 'squash')
      expect(await git(repos.origin, 'log', '-1', '--format=%B', 'feat/work')).toContain(
        'correction body',
      );
    expect(await remote()).toBe(await head());
    expect(process.exitCode).toBeUndefined();
  });

  it('warns on ambiguous ancestry and offers configured main', async () => {
    await git(repos.user, 'push', '-q', 'origin', 'HEAD:parent/one');
    await git(repos.user, 'checkout', '-q', '-b', 'side', 'production');
    await commitFile(repos.user, 'side.txt', 'side\n');
    await git(repos.user, 'push', '-q', 'origin', 'HEAD:parent/two');
    await git(repos.user, 'checkout', '-q', 'feat/work');
    await git(repos.user, 'merge', '--no-ff', '-m', 'merge side', 'side');
    const warn = vi.spyOn(logger, 'warn');
    await run();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ambiguous ancestry: parent/one, parent/two'),
    );
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ default: 'production' }));
    expect(process.exitCode).toBeUndefined();
  });

  it('blocks an unmatched fixup before pushing', async () => {
    await git(repos.user, 'commit', '--allow-empty', '-m', 'fixup! missing subject');
    const before = await remote();
    const error = vi.spyOn(logger, 'error');
    await run('production');
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Not pushing: fixup or merge commits remain'),
    );
    expect(await remote()).toBe(before);
  });

  it('cancels a target prompt cleanly', async () => {
    vi.mocked(input).mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { name: 'ExitPromptError' }),
    );
    const before = await remote();
    await run();
    expect(process.exitCode).toBeUndefined();
    expect(await remote()).toBe(before);
  });

  it('removes merge commits despite local rebase-merges configuration', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'side', 'production');
    await commitFile(repos.user, 'side.txt', 'side\n');
    await git(repos.user, 'checkout', '-q', 'feat/work');
    await git(repos.user, 'merge', '--no-ff', '-m', 'merge side', 'side');
    await git(repos.user, 'config', 'rebase.rebaseMerges', 'true');
    await run('production');
    expect(await git(repos.origin, 'rev-list', '--merges', 'production..feat/work')).toBe('');
    expect(await subjects()).toContain('edit side.txt');
    expect(process.exitCode).toBeUndefined();
  });
});
