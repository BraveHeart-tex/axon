import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import { logger } from '@/infra/logger.js';

import { commitFile, createTestRepos, git, TestRepos } from './helpers/gitRepos.js';

let repos: TestRepos;

const advanceDevelop = async () => {
  await git(repos.other, 'pull', '-q', 'origin', 'develop');
  const sha = await commitFile(repos.other, 'develop.txt', 'develop\n');
  await git(repos.other, 'push', '-q', 'origin', 'develop');
  return sha;
};

const originSha = (branch: string) => git(repos.origin, 'rev-parse', `refs/heads/${branch}`);

const isAncestor = async (ancestor: string, descendant: string) =>
  git(repos.origin, 'merge-base', '--is-ancestor', ancestor, descendant).then(
    () => true,
    () => false,
  );

describe('runSyncBranchFlow against real repos', () => {
  beforeEach(async () => {
    process.exitCode = undefined;
    repos = await createTestRepos();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repos.cleanup();
    process.exitCode = undefined;
  });

  it('refuses to overwrite commits on origin that the local copy is missing', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/s', 'develop');
    await commitFile(repos.user, 's1.txt', 'mine\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/s');
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'feat/s');
    const otherSha = await commitFile(repos.other, 's2.txt', 'from other\n');
    await git(repos.other, 'push', '-q', 'origin', 'feat/s');
    await git(repos.other, 'checkout', '-q', 'develop');
    await advanceDevelop();
    const error = vi.spyOn(logger, 'error');

    await runSyncBranchFlow('develop');

    expect(error).toHaveBeenCalledWith(
      "origin/feat/s has 1 commit(s) you don't have locally. Run git pull --rebase first.",
    );
    expect(await originSha('feat/s')).toBe(otherSha);
    expect(process.exitCode).toBe(1);
  });

  it('pushes a branch that was never pushed', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/new', 'develop');
    await commitFile(repos.user, 'new.txt', 'new\n');
    const developSha = await advanceDevelop();

    await runSyncBranchFlow('develop');

    const pushed = await originSha('feat/new');
    expect(pushed).toBe(await git(repos.user, 'rev-parse', 'HEAD'));
    expect(await isAncestor(developSha, pushed)).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('rebases and pushes a normal branch', async () => {
    await git(repos.user, 'checkout', '-q', '-b', 'feat/n', 'develop');
    await commitFile(repos.user, 'n.txt', 'n\n');
    await git(repos.user, 'push', '-q', '-u', 'origin', 'feat/n');
    const before = await originSha('feat/n');
    const developSha = await advanceDevelop();

    await runSyncBranchFlow('develop');

    const pushed = await originSha('feat/n');
    expect(pushed).not.toBe(before);
    expect(pushed).toBe(await git(repos.user, 'rev-parse', 'HEAD'));
    expect(await isAncestor(developSha, pushed)).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });
});
