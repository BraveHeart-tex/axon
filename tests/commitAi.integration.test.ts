import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { confirm, select } from '@inquirer/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateAiResponse } from '@/domains/ai/ai.service.js';
import { runCommitAiFlow } from '@/domains/ai/commit/commitAi.service.js';
import { ensureAiApiKey } from '@/domains/ai/commit/flows/ensureAiApiKey.flow.js';
import { resolveCommitContext } from '@/domains/ai/commit/flows/resolveCommitContext.flow.js';
import * as gitService from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

import { commitFile, createTestRepos, git, type TestRepos } from './helpers/gitRepos.js';
import { projectContext } from './helpers/projectContext.js';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn(), select: vi.fn(), input: vi.fn() }));
vi.mock('@/domains/ai/ai.service.js', () => ({ generateAiResponse: vi.fn() }));
vi.mock('@/domains/ai/commit/flows/ensureAiApiKey.flow.js', () => ({ ensureAiApiKey: vi.fn() }));
vi.mock('@/domains/ai/commit/flows/resolveCommitContext.flow.js', () => ({
  resolveCommitContext: vi.fn(),
}));
const classified = projectContext({
  version: 1,
  flow: 'classified',
  classified: { mainBranch: 'production', developBranch: 'staging' },
});
let repos: TestRepos;
const head = () => git(repos.user, 'rev-parse', 'HEAD');
const subjects = () => git(repos.user, 'log', '--format=%s', 'origin/production..HEAD');
const stage = async (content = 'fixed\n') => {
  await writeFile(path.join(repos.user, 'work.txt'), content);
  await git(repos.user, 'add', 'work.txt');
};
const chooseFixup = (sha: string) => {
  vi.mocked(select).mockResolvedValueOnce('fixup').mockResolvedValueOnce(sha);
};

describe('commit-ai Phase 5 in temp repos', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    process.exitCode = undefined;
    vi.mocked(ensureAiApiKey).mockResolvedValue('key');
    vi.mocked(generateAiResponse).mockResolvedValue('fix: review changes');
    vi.mocked(resolveCommitContext).mockResolvedValue({ diff: 'diff', branchName: 'feat/work' });
    vi.mocked(confirm).mockResolvedValue(false);
    repos = await createTestRepos();
    await git(repos.user, 'branch', 'production');
    await git(repos.user, 'push', '-q', 'origin', 'production');
    await git(repos.user, 'checkout', '-q', '-b', 'feat/work', 'production');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await repos.cleanup();
    process.exitCode = undefined;
  });

  it.each(['default', 'gitflow', 'empty', 'fixups-only', 'classified'])(
    'offers fixup only for eligible classified history: %s',
    async (kind) => {
      if (kind !== 'empty') {
        await git(
          repos.user,
          'commit',
          '--allow-empty',
          '-m',
          kind === 'fixups-only' ? 'fixup! absent' : 'feat: work',
        );
      }
      const context =
        kind === 'default'
          ? projectContext()
          : kind === 'gitflow'
            ? projectContext({ version: 1, flow: 'gitflow' })
            : classified;
      vi.mocked(select)
        .mockResolvedValueOnce(kind === 'classified' ? 'new' : 'quit')
        .mockResolvedValueOnce('quit');
      await runCommitAiFlow(context);
      expect(
        vi
          .mocked(select)
          .mock.calls[0][0].choices?.map((choice) =>
            typeof choice === 'object' ? choice.name : choice,
          ),
      ).toEqual(
        kind === 'classified'
          ? ['New commit', 'Fix up an existing commit']
          : ['Accept & commit', 'Edit message', 'Regenerate', 'Quit'],
      );
    },
  );

  it('creates fixup without AI or credentials, filters every fixup prefix, and leaves it on decline', async () => {
    const sha = await commitFile(repos.user, 'work.txt', 'work\n');
    for (const prefix of ['fixup!', 'squash!', 'amend!']) {
      await git(repos.user, 'commit', '--allow-empty', '-m', `${prefix} edit work.txt`);
    }
    await stage();
    chooseFixup(sha);
    await runCommitAiFlow(classified);
    expect(select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        choices: [{ name: `${sha.slice(0, 12)} edit work.txt`, value: sha }],
      }),
    );
    expect(await git(repos.user, 'log', '-1', '--format=%s')).toBe('fixup! edit work.txt');
    expect(ensureAiApiKey).not.toHaveBeenCalled();
    expect(resolveCommitContext).not.toHaveBeenCalled();
    expect(generateAiResponse).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith({
      message: 'Squash into edit work.txt and push now?',
      default: false,
    });
    expect(process.exitCode).toBeUndefined();
  });

  it.each([false, true])(
    'squashes and pushes with unchanged base, previously pushed: %s',
    async (pushed) => {
      const base = await head();
      const sha = await commitFile(repos.user, 'work.txt', 'work\n');
      if (pushed) await git(repos.user, 'push', '-q', 'origin', 'feat/work');
      await commitFile(repos.other, 'upstream.txt', 'new main\n');
      await git(repos.other, 'push', '-q', 'origin', 'HEAD:production');
      await stage();
      chooseFixup(sha);
      vi.mocked(confirm).mockResolvedValue(true);
      const push = vi.spyOn(gitService, 'pushHeadWithLease');
      await runCommitAiFlow(classified);
      expect(process.exitCode).toBeUndefined();
      expect(await subjects()).toBe('edit work.txt');
      expect(await git(repos.user, 'rev-parse', 'HEAD^')).toBe(base);
      expect(await git(repos.origin, 'rev-parse', 'feat/work')).toBe(await head());
      expect(push).toHaveBeenCalledWith('feat/work', pushed ? sha : '', expect.any(Object));
      expect(
        await git(repos.user, 'for-each-ref', '--format=%(upstream)', 'refs/heads/feat/work'),
      ).toBe('');
      expect(generateAiResponse).not.toHaveBeenCalled();
    },
  );

  it('aborts conflicting squash and preserves the fixup and remote', async () => {
    const sha = await commitFile(repos.user, 'work.txt', 'first\n');
    await commitFile(repos.user, 'work.txt', 'second\n');
    const previous = await head();
    await git(repos.user, 'push', '-q', 'origin', 'feat/work');
    await stage('third\n');
    chooseFixup(sha);
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi.spyOn(logger, 'error');
    await runCommitAiFlow(classified);
    expect(process.exitCode).toBe(1);
    expect(await git(repos.user, 'rev-parse', 'HEAD^')).toBe(previous);
    expect(await git(repos.user, 'log', '-1', '--format=%s')).toBe('fixup! edit work.txt');
    expect(await git(repos.origin, 'rev-parse', 'feat/work')).toBe(previous);
    expect(await git(repos.user, 'status', '--porcelain')).toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('run axon sb to squash and rebase'));
  });

  it.each(['default', 'gitflow', 'classified'])(
    'new commit pushes without upstream: %s',
    async (kind) => {
      const context =
        kind === 'default'
          ? projectContext()
          : kind === 'gitflow'
            ? projectContext({ version: 1, flow: 'gitflow' })
            : classified;
      await stage();
      vi.mocked(select).mockResolvedValue('commit');
      vi.mocked(confirm).mockResolvedValue(true);
      await runCommitAiFlow(context);
      expect(process.exitCode).toBeUndefined();
      expect(await git(repos.origin, 'rev-parse', 'feat/work')).toBe(await head());
      expect(generateAiResponse).toHaveBeenCalledOnce();
    },
  );

  it.each(['new', 'fixup'])('refuses remote-ahead before push or rewrite: %s', async (kind) => {
    const sha = await commitFile(repos.user, 'work.txt', 'work\n');
    await git(repos.user, 'push', '-q', 'origin', 'feat/work');
    await git(repos.other, 'fetch', 'origin');
    await git(repos.other, 'checkout', '-q', '-b', 'feat/work', 'origin/feat/work');
    const remoteSha = await commitFile(repos.other, 'remote.txt', 'remote\n');
    await git(repos.other, 'push', '-q', 'origin', 'feat/work');
    await stage();
    if (kind === 'fixup') chooseFixup(sha);
    else vi.mocked(select).mockResolvedValueOnce('new').mockResolvedValueOnce('commit');
    vi.mocked(confirm).mockResolvedValue(true);
    const error = vi.spyOn(logger, 'error');
    const squash = vi.spyOn(gitService, 'autosquashInPlace');
    await runCommitAiFlow(classified);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Run git pull --rebase first.'));
    expect(await git(repos.origin, 'rev-parse', 'feat/work')).toBe(remoteSha);
    expect(squash).not.toHaveBeenCalled();
    expect(await git(repos.user, 'rev-parse', 'HEAD^')).toBe(sha);
  });

  it('refuses a remote change after lease capture', async () => {
    const sha = await commitFile(repos.user, 'work.txt', 'work\n');
    await git(repos.user, 'push', '-q', 'origin', 'feat/work');
    await stage();
    chooseFixup(sha);
    vi.mocked(confirm).mockResolvedValue(true);
    const original = gitService.autosquashInPlace;
    let changedRemote = '';
    vi.spyOn(gitService, 'autosquashInPlace').mockImplementation(async (base, options) => {
      await original(base, options);
      await git(repos.other, 'fetch', 'origin');
      await git(repos.other, 'checkout', '-q', '-b', 'feat/work', 'origin/feat/work');
      changedRemote = await commitFile(repos.other, 'remote.txt', 'remote\n');
      await git(repos.other, 'push', '-q', 'origin', 'feat/work');
    });
    await runCommitAiFlow(classified);
    expect(process.exitCode).toBe(1);
    expect(await git(repos.origin, 'rev-parse', 'feat/work')).toBe(changedRemote);
    expect(await git(repos.user, 'log', '-1', '--format=%s')).toBe('edit work.txt');
  });

  it('canceling squash confirmation preserves the saved fixup', async () => {
    const sha = await commitFile(repos.user, 'work.txt', 'work\n');
    await stage();
    chooseFixup(sha);
    vi.mocked(confirm).mockRejectedValue(
      Object.assign(new Error('canceled'), { name: 'ExitPromptError' }),
    );
    await runCommitAiFlow(classified);
    expect(await git(repos.user, 'log', '-1', '--format=%s')).toBe('fixup! edit work.txt');
    expect(await git(repos.user, 'rev-parse', 'HEAD^')).toBe(sha);
    expect(generateAiResponse).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('cancels the first prompt cleanly without AI or a commit', async () => {
    await commitFile(repos.user, 'work.txt', 'work\n');
    const before = await head();
    await stage();
    vi.mocked(select).mockRejectedValue(
      Object.assign(new Error('canceled'), { name: 'ExitPromptError' }),
    );
    await runCommitAiFlow(classified);
    expect(await head()).toBe(before);
    expect(ensureAiApiKey).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
