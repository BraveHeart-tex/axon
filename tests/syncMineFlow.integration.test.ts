import { existsSync } from 'node:fs';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import { checkGlabAuth, listMyOpenMergeRequests } from '@/domains/mr/glab.service.js';
import { createInterruptHandler } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

import { commitFile, createTestRepos, git, TestRepos } from './helpers/gitRepos.js';

vi.mock('ora', async (importOriginal) => {
  const { default: ora } = await importOriginal<typeof import('ora')>();
  return { default: (options: object) => ora({ ...options, isSilent: true }) };
});

vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

const mockedCheckGlabAuth = vi.mocked(checkGlabAuth);
const mockedListMyOpenMergeRequests = vi.mocked(listMyOpenMergeRequests);

const mr = (iid: string, sourceBranch: string, targetBranch = 'develop') => ({
  iid,
  sourceBranch,
  targetBranch,
  sourceProjectId: 1,
  targetProjectId: 1,
  draft: false,
});

let repos: TestRepos;

const pushFeature = async (branch: string, ...files: string[]) => {
  await git(repos.user, 'checkout', '-q', '-b', branch, 'develop');
  for (const file of files) await commitFile(repos.user, file, `${branch}\n`);
  await git(repos.user, 'push', '-q', '-u', 'origin', branch);
  await git(repos.user, 'checkout', '-q', 'develop');
};

const advanceDevelop = async (file = 'develop.txt', content = 'develop\n') => {
  await git(repos.other, 'pull', '-q', 'origin', 'develop');
  const sha = await commitFile(repos.other, file, content);
  await git(repos.other, 'push', '-q', 'origin', 'develop');
  return sha;
};

const originSha = (branch: string) => git(repos.origin, 'rev-parse', `refs/heads/${branch}`);

const isAncestor = async (ancestor: string, descendant: string) =>
  git(repos.origin, 'merge-base', '--is-ancestor', ancestor, descendant).then(
    () => true,
    () => false,
  );

const isMidRebase = () =>
  ['rebase-merge', 'rebase-apply'].some((dir) => existsSync(path.join(repos.user, '.git', dir)));

const sync = (options: { keepWorktrees?: boolean; concurrency?: number } = {}) =>
  runSyncMineFlow({ yes: true, concurrency: 4, keepWorktrees: false, ...options });

const gitDir = () => path.join(repos.user, '.git');

const lockFile = () => path.join(gitDir(), 'axon-sync.lock');

// A merge commit makes `git replay` fail, so the MR goes through the worktree fallback.
// With `slow`, it also carries a file that runs the `slow` smudge filter on checkout.
const pushMergeFeature = async (branch: string, { slow = false } = {}) => {
  await git(repos.user, 'checkout', '-q', '-b', `${branch}-side`, 'develop');
  await commitFile(repos.user, `${branch.replace('/', '-')}-side.txt`, 'side\n');
  await git(repos.user, 'checkout', '-q', '-b', branch, 'develop');
  await commitFile(repos.user, `${branch.replace('/', '-')}.txt`, `${branch}\n`);
  if (slow) {
    await commitFile(repos.user, '.gitattributes', '*.slow filter=slow\n');
    await commitFile(repos.user, 'data.slow', 'slow\n');
  }
  await git(repos.user, 'merge', '-q', '--no-ff', '--no-edit', `${branch}-side`);
  await git(repos.user, 'push', '-q', '-u', 'origin', branch);
  await git(repos.user, 'checkout', '-q', 'develop');
  await git(repos.user, 'branch', '-q', '-D', `${branch}-side`);
};

// The smudge filter runs `script` whenever a worktree checks out a *.slow file.
const setSmudgeFilter = async (script: string) => {
  const file = path.join(repos.user, '..', 'smudge.sh');
  await writeFile(file, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\n${script}\ncat\n`);
  await chmod(file, 0o755);
  await git(repos.user, 'config', 'filter.slow.smudge', file);
};

const leftovers = async () => ({
  worktrees: (await git(repos.user, 'worktree', 'list', '--porcelain'))
    .split('\n')
    .filter((line) => line.startsWith('worktree ') && line.includes('/.git/axon-sync/')),
  branches: await git(
    repos.user,
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads/axon-sync/',
  ),
  workspace: existsSync(path.join(gitDir(), 'axon-sync'))
    ? await readdir(path.join(gitDir(), 'axon-sync'))
    : [],
  lock: existsSync(lockFile()),
});

const noLeftovers = { worktrees: [], branches: '', workspace: [], lock: false };

describe('runSyncMineFlow against real repos', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    repos = await createTestRepos();
    mockedCheckGlabAuth.mockResolvedValue(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repos.cleanup();
    process.exitCode = undefined;
  });

  it('syncs from origin/<src> when the local copy is stale and keeps the remote commit', async () => {
    await pushFeature('feat/a', 'a1.txt');
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'feat/a');
    await commitFile(repos.other, 'a2.txt', 'from other\n');
    await git(repos.other, 'push', '-q', 'origin', 'feat/a');
    await git(repos.other, 'checkout', '-q', 'develop');
    const developSha = await advanceDevelop();
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);

    await sync();

    const synced = await originSha('feat/a');
    expect(await isAncestor(developSha, synced)).toBe(true);
    await expect(git(repos.origin, 'cat-file', '-e', `${synced}:a2.txt`)).resolves.toBe('');
    expect(await git(repos.user, 'rev-parse', 'refs/heads/feat/a')).toBe(synced);
    expect(await git(repos.user, 'branch', '--show-current')).toBe('develop');
    expect(process.exitCode).toBeUndefined();
  });

  it('skips an MR with local-only commits and pushes nothing', async () => {
    await pushFeature('feat/a', 'a1.txt');
    await git(repos.user, 'checkout', '-q', 'feat/a');
    const localSha = await commitFile(repos.user, 'local.txt', 'unpushed\n');
    await git(repos.user, 'checkout', '-q', 'develop');
    await advanceDevelop();
    const before = await originSha('feat/a');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);
    const warn = vi.spyOn(logger, 'warn');

    await sync();

    expect(await originSha('feat/a')).toBe(before);
    expect(await git(repos.user, 'rev-parse', 'refs/heads/feat/a')).toBe(localSha);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped (local-only commits)'));
    expect(process.exitCode).toBeUndefined();
  });

  it('syncs an MR whose local commits are only pre-rebase copies of origin/<src>', async () => {
    await pushFeature('feat/a', 'a1.txt');
    const developSha = await advanceDevelop();
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'feat/a');
    await git(repos.other, 'rebase', '-q', 'origin/develop');
    await git(repos.other, 'push', '-q', '--force', 'origin', 'feat/a');
    await git(repos.other, 'checkout', '-q', 'develop');
    const laterDevelopSha = await advanceDevelop('later.txt', 'later\n');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);

    await sync();

    const synced = await originSha('feat/a');
    expect(await isAncestor(developSha, synced)).toBe(true);
    expect(await isAncestor(laterDevelopSha, synced)).toBe(true);
    expect(await git(repos.user, 'rev-parse', 'refs/heads/feat/a')).toBe(synced);
    expect(process.exitCode).toBeUndefined();
  });

  it('aborts a conflict, still syncs the next MR and leaves the original branch checked out', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/conflict', 'develop');
    await commitFile(repos.user, 'README.md', 'feature change\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/conflict');
    await git(repos.user, 'checkout', '-q', 'develop');
    await pushFeature('feat/b', 'b.txt');
    const developSha = await advanceDevelop('README.md', 'develop change\n');
    const conflictBefore = await originSha('feat/conflict');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/conflict'), mr('2', 'feat/b')]);

    await sync();

    expect(await originSha('feat/conflict')).toBe(conflictBefore);
    expect(await isAncestor(developSha, await originSha('feat/b'))).toBe(true);
    expect(await git(repos.user, 'branch', '--show-current')).toBe('develop');
    expect(isMidRebase()).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('reports an up-to-date MR without checking it out and fails a missing branch', async () => {
    await pushFeature('feat/current', 'c.txt');
    await pushFeature('feat/b', 'b.txt');
    await advanceDevelop();
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'feat/b');
    await git(repos.other, 'rebase', '-q', 'origin/develop');
    await git(repos.other, 'push', '-q', '--force', 'origin', 'feat/b');
    const upToDate = await originSha('feat/b');
    const reflog = () => git(repos.user, 'reflog', '--format=%gs', 'HEAD');
    const reflogBefore = await reflog();

    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/b'), mr('2', 'feat/gone')]);
    const success = vi.spyOn(logger, 'success');
    const error = vi.spyOn(logger, 'error');

    await sync();

    expect(await originSha('feat/b')).toBe(upToDate);
    const newEntries = (await reflog()).slice(0, -reflogBefore.length);
    expect(newEntries).not.toContain('feat/b');
    expect(success).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/b -> develop — up-to-date'),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/gone -> develop — failed (origin/feat/gone not found)'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('leaves your worktree, index and HEAD untouched', async () => {
    await pushFeature('feat/a', 'a1.txt');
    await pushMergeFeature('feat/m');
    await advanceDevelop();
    await git(repos.user, 'checkout', '-q', '-b', 'wip', 'develop');
    await writeFile(path.join(repos.user, 'README.md'), 'unstaged\n');
    await writeFile(path.join(repos.user, 'staged.txt'), 'staged\n');
    await git(repos.user, 'add', 'staged.txt');
    await writeFile(path.join(repos.user, 'untracked.txt'), 'untracked\n');
    const snapshot = async () => ({
      head: await git(repos.user, 'rev-parse', 'HEAD'),
      branch: await git(repos.user, 'symbolic-ref', 'HEAD'),
      index: await git(repos.user, 'ls-files', '--stage'),
      status: await git(repos.user, 'status', '--porcelain=v2', '--untracked-files=all'),
      reflog: await git(repos.user, 'reflog', 'HEAD'),
    });
    const before = await snapshot();
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a'), mr('2', 'feat/m')]);
    const success = vi.spyOn(logger, 'success');

    await sync();

    expect(await snapshot()).toEqual(before);
    expect(success).toHaveBeenCalledWith(expect.stringContaining('!1: feat/a -> develop — synced'));
    expect(success).toHaveBeenCalledWith(expect.stringContaining('!2: feat/m -> develop — synced'));
    expect(await leftovers()).toEqual(noLeftovers);
    expect(process.exitCode).toBeUndefined();
  });

  it('syncs a two-level stack parent first, then the child onto the new parent', async () => {
    await pushFeature('feat/a', 'a1.txt');
    await git(repos.user, 'checkout', '-q', '-b', 'feat/b', 'feat/a');
    await commitFile(repos.user, 'b1.txt', 'b\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/b');
    await git(repos.user, 'checkout', '-q', 'develop');
    const developSha = await advanceDevelop();
    mockedListMyOpenMergeRequests.mockResolvedValue([
      mr('2', 'feat/b', 'feat/a'),
      mr('1', 'feat/a'),
    ]);

    await sync();

    const parent = await originSha('feat/a');
    const child = await originSha('feat/b');
    expect(await isAncestor(developSha, parent)).toBe(true);
    expect(await git(repos.origin, 'rev-parse', `${child}~1`)).toBe(parent);
    expect(await git(repos.user, 'rev-parse', 'refs/heads/feat/b')).toBe(child);
    expect(process.exitCode).toBeUndefined();
  });

  it('skips the child of a stack when the parent conflicts', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/a', 'develop');
    await commitFile(repos.user, 'README.md', 'feature change\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/a');
    await git(repos.user, 'checkout', '-q', '-b', 'feat/b', 'feat/a');
    await commitFile(repos.user, 'b1.txt', 'b\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/b');
    await git(repos.user, 'checkout', '-q', 'develop');
    await advanceDevelop('README.md', 'develop change\n');
    const before = { a: await originSha('feat/a'), b: await originSha('feat/b') };
    mockedListMyOpenMergeRequests.mockResolvedValue([
      mr('1', 'feat/a'),
      mr('2', 'feat/b', 'feat/a'),
    ]);
    const error = vi.spyOn(logger, 'error');
    const warn = vi.spyOn(logger, 'warn');

    await sync();

    expect({ a: await originSha('feat/a'), b: await originSha('feat/b') }).toEqual(before);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/a -> develop — failed (conflict)'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/b -> feat/a — skipped (parent failed)'),
    );
    expect(await leftovers()).toEqual(noLeftovers);
    expect(process.exitCode).toBe(1);
  });

  it('falls back to a worktree rebase when replay fails', async () => {
    await pushMergeFeature('feat/m');
    const developSha = await advanceDevelop();
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/m')]);

    await sync({ keepWorktrees: true });

    const synced = await originSha('feat/m');
    expect(await isAncestor(developSha, synced)).toBe(true);
    expect(await git(path.join(gitDir(), 'axon-sync', '1'), 'rev-parse', 'HEAD')).toBe(synced);
    expect(process.exitCode).toBeUndefined();
  });

  it('runs the worktree fallback when replay hits a conflict, then aborts it', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/conflict', 'develop');
    await commitFile(repos.user, 'README.md', 'feature change\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/conflict');
    await git(repos.user, 'checkout', '-q', 'develop');
    await advanceDevelop('README.md', 'develop change\n');
    const before = await originSha('feat/conflict');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/conflict')]);

    await sync({ keepWorktrees: true });

    const worktree = path.join(gitDir(), 'axon-sync', '1');
    expect(await git(worktree, 'rev-parse', 'HEAD')).toBe(before);
    expect(await git(worktree, 'status', '--porcelain')).toBe('');
    expect(await originSha('feat/conflict')).toBe(before);
    expect(process.exitCode).toBe(1);
  });

  it('refuses to run while another sync holds the lock', async () => {
    await writeFile(lockFile(), `${process.pid}\n`);
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);
    const error = vi.spyOn(logger, 'error');

    await sync();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(`Another sync is running (pid ${process.pid})`),
    );
    expect(mockedListMyOpenMergeRequests).not.toHaveBeenCalled();
    expect(await readFile(lockFile(), 'utf8')).toBe(`${process.pid}\n`);
    expect(process.exitCode).toBe(1);
  });

  it('clears a lock left by a process that is no longer running', async () => {
    const { pid } = await execa('node', ['-e', '']);
    await writeFile(lockFile(), `${pid}\n`);
    await pushFeature('feat/a', 'a1.txt');
    const developSha = await advanceDevelop();
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);

    await sync();

    expect(await isAncestor(developSha, await originSha('feat/a'))).toBe(true);
    expect(existsSync(lockFile())).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('cleans up worktrees and axon-sync branches left by a crashed run', async () => {
    const worktree = path.join(gitDir(), 'axon-sync', '9');
    await git(repos.user, 'branch', 'axon-sync/9', 'develop');
    await git(repos.user, 'worktree', 'add', '-q', '--detach', worktree, 'develop');
    await commitFile(worktree, 'wt.txt', 'one\n');
    await git(worktree, 'checkout', '-q', 'HEAD~1');
    await commitFile(worktree, 'wt.txt', 'two\n');
    await git(worktree, 'rebase', '-q', 'HEAD@{2}').catch(() => undefined);
    mockedListMyOpenMergeRequests.mockResolvedValue([]);
    const info = vi.spyOn(logger, 'info');

    await sync();

    expect(info).toHaveBeenCalledWith('Removed 2 leftover(s) from an earlier sync.');
    expect(await leftovers()).toEqual(noLeftovers);
  });

  it('rejects the whole stack when one lease in it is stale', async () => {
    await pushFeature('feat/a', 'a1.txt');
    await git(repos.user, 'checkout', '-q', '-b', 'feat/b', 'feat/a');
    await commitFile(repos.user, 'b1.txt', 'b\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/b');
    await git(repos.user, 'checkout', '-q', 'develop');
    await pushMergeFeature('feat/m', { slow: true });
    await advanceDevelop();
    const parentBefore = await originSha('feat/a');
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'feat/b');
    await commitFile(repos.other, 'b2.txt', 'from other\n');
    // Pushed while feat/m checks out its worktree: after the fetch, before the stack is pushed.
    await setSmudgeFilter(`git -C "${repos.other}" push -q origin feat/b >/dev/null 2>&1`);
    mockedListMyOpenMergeRequests.mockResolvedValue([
      mr('1', 'feat/a'),
      mr('2', 'feat/b', 'feat/a'),
      mr('3', 'feat/m'),
    ]);
    const error = vi.spyOn(logger, 'error');
    const warn = vi.spyOn(logger, 'warn');
    const success = vi.spyOn(logger, 'success');

    await sync();

    expect(await originSha('feat/a')).toBe(parentBefore);
    expect(await originSha('feat/b')).toBe(await git(repos.other, 'rev-parse', 'HEAD'));
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/b -> feat/a — failed (remote changed)'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/a -> develop — skipped (stack rejected)'),
    );
    expect(success).toHaveBeenCalledWith(expect.stringContaining('!3: feat/m -> develop — synced'));
    expect(process.exitCode).toBe(1);
  });

  it('leaves no axon-sync worktree, branch or lock behind after Ctrl+C', async () => {
    await pushMergeFeature('feat/slow', { slow: true });
    await pushFeature('feat/b', 'b.txt');
    await advanceDevelop();
    const before = await originSha('feat/slow');
    const marker = path.join(repos.user, '..', 'smudge-started');
    await setSmudgeFilter(`echo $$ > "${marker}"\nsleep 5`);
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/slow'), mr('2', 'feat/b')]);
    const error = vi.spyOn(logger, 'error');
    const exit = vi.fn();
    const interrupt = createInterruptHandler({ exit, stdout: vi.fn(), stderr: vi.fn() });

    const flow = sync({ concurrency: 1 });
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000 });

    // A real Ctrl+C reaches git's filter too, since they share the terminal's process group.
    process.kill(Number((await readFile(marker, 'utf8')).trim()), 'SIGINT');
    await interrupt();
    await flow;

    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
    expect(await leftovers()).toEqual(noLeftovers);
    expect(await originSha('feat/slow')).toBe(before);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/slow -> develop — interrupted (Ctrl+C)'),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/b -> develop — not run (interrupted)'),
    );
    expect(process.exitCode).toBe(130);
  }, 20_000);

  it('marks MRs interrupted when Ctrl+C lands during the push, and a rerun finds them up to date', async () => {
    await pushFeature('feat/a', 'a1.txt');
    const developSha = await advanceDevelop();
    const marker = path.join(repos.user, '..', 'push-landed');
    const receivePack = path.join(repos.user, '..', 'receive-pack.sh');
    await writeFile(
      receivePack,
      `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ngit receive-pack "$@"\necho $$ > "${marker}"\nexec sleep 5\n`,
    );
    await chmod(receivePack, 0o755);
    await git(repos.user, 'config', 'remote.origin.receivepack', receivePack);
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);
    const error = vi.spyOn(logger, 'error');
    const success = vi.spyOn(logger, 'success');
    const exit = vi.fn();
    const interrupt = createInterruptHandler({ exit, stdout: vi.fn(), stderr: vi.fn() });

    const flow = sync();
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000 });

    process.kill(Number((await readFile(marker, 'utf8')).trim()), 'SIGINT');
    await interrupt();
    await flow;

    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
    expect(process.exitCode).toBe(130);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/a -> develop — interrupted (rerun to verify)'),
    );
    expect(await leftovers()).toEqual(noLeftovers);
    expect(await isAncestor(developSha, await originSha('feat/a'))).toBe(true);

    await git(repos.user, 'config', '--unset', 'remote.origin.receivepack');
    process.exitCode = undefined;

    await sync();

    expect(success).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/a -> develop — up-to-date'),
    );
    expect(process.exitCode).toBeUndefined();
  }, 20_000);
});
