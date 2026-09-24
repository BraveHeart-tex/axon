import { existsSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import { checkGlabAuth, listMyOpenMergeRequests } from '@/domains/mr/glab.service.js';
import { createInterruptHandler } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

import { commitFile, createTestRepos, git, TestRepos } from './helpers/gitRepos.js';

vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

const mockedCheckGlabAuth = vi.mocked(checkGlabAuth);
const mockedListMyOpenMergeRequests = vi.mocked(listMyOpenMergeRequests);

const mr = (iid: string, sourceBranch: string) => ({ iid, sourceBranch, targetBranch: 'develop' });

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

    await runSyncMineFlow({ yes: true });

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

    await runSyncMineFlow({ yes: true });

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
    const rebased = await originSha('feat/a');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/a')]);

    await runSyncMineFlow({ yes: true });

    expect(await originSha('feat/a')).toBe(rebased);
    expect(await isAncestor(developSha, rebased)).toBe(true);
    expect(await git(repos.user, 'rev-parse', 'refs/heads/feat/a')).toBe(rebased);
    expect(process.exitCode).toBeUndefined();
  });

  it('aborts a conflict, still syncs the next MR and restores the original branch', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/conflict', 'develop');
    await commitFile(repos.user, 'README.md', 'feature change\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/conflict');
    await git(repos.user, 'checkout', '-q', 'develop');
    await pushFeature('feat/b', 'b.txt');
    const developSha = await advanceDevelop('README.md', 'develop change\n');
    const conflictBefore = await originSha('feat/conflict');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/conflict'), mr('2', 'feat/b')]);

    await runSyncMineFlow({ yes: true });

    expect(await originSha('feat/conflict')).toBe(conflictBefore);
    expect(await isAncestor(developSha, await originSha('feat/b'))).toBe(true);
    expect(await git(repos.user, 'branch', '--show-current')).toBe('develop');
    expect(isMidRebase()).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('restores the original branch with no rebase in progress after Ctrl+C mid-rebase', async () => {
    await pushFeature('feat/slow', 'slow1.txt', 'slow2.txt');
    await pushFeature('feat/b', 'b.txt');
    await advanceDevelop();
    const before = await originSha('feat/slow');
    mockedListMyOpenMergeRequests.mockResolvedValue([mr('1', 'feat/slow'), mr('2', 'feat/b')]);

    const marker = path.join(repos.user, '.git', 'rebase-started');
    const hook = path.join(repos.user, '.git', 'hooks', 'post-commit');
    await writeFile(hook, `#!/bin/sh\necho $PPID > "${marker}"\nexec sleep 5\n`);
    await chmod(hook, 0o755);
    const error = vi.spyOn(logger, 'error');
    const exit = vi.fn();
    const interrupt = createInterruptHandler({ exit, stdout: vi.fn(), stderr: vi.fn() });

    const flow = runSyncMineFlow({ yes: true });
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000 });
    const rebasePid = Number((await readFile(marker, 'utf8')).trim());

    // A real Ctrl+C reaches git too, since it shares the terminal's process group.
    process.kill(rebasePid, 'SIGINT');
    await interrupt();
    await flow;

    expect(exit).toHaveBeenCalledExactlyOnceWith(130);

    expect(await git(repos.user, 'branch', '--show-current')).toBe('develop');
    expect(isMidRebase()).toBe(false);
    expect(await originSha('feat/slow')).toBe(before);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!1: feat/slow -> develop — interrupted'),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('!2: feat/b -> develop — not run (interrupted)'),
    );
  });
});
