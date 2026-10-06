import { existsSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import * as gitService from '@/domains/git/git.service.js';
import {
  checkGlabAuth,
  hasMrApprovals,
  listMyOpenMergeRequests,
  type MyMergeRequest,
} from '@/domains/mr/glab.service.js';
import { createInterruptHandler } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

import { commitFile, createTestRepos, git, type TestRepos } from './helpers/gitRepos.js';
import { projectContext } from './helpers/projectContext.js';

vi.mock('ora', async (original) => {
  const { default: ora } = await original<typeof import('ora')>();
  return { default: (options: object) => ora({ ...options, isSilent: true }) };
});
vi.mock('@/domains/mr/glab.service.js', () => ({
  checkGlabAuth: vi.fn(),
  hasMrApprovals: vi.fn(),
  listMyOpenMergeRequests: vi.fn(),
}));

const context = projectContext({
  version: 1,
  flow: 'classified',
  classified: {
    mainBranch: 'production',
    developBranch: 'assembly',
    qaPassedLabel: 'verified',
  },
});
const mr = (
  iid: string,
  sourceBranch: string,
  overrides: Partial<MyMergeRequest> = {},
): MyMergeRequest => ({
  iid,
  sourceBranch,
  targetBranch: 'production',
  sourceProjectId: 1,
  targetProjectId: 1,
  draft: false,
  labels: [],
  ...overrides,
});
let repos: TestRepos;
const head = (branch: string) => git(repos.origin, 'rev-parse', `refs/heads/${branch}`);
const sync = (
  mrs: MyMergeRequest[],
  options: Partial<Parameters<typeof runSyncMineFlow>[0]> = {},
  project = context,
) => {
  vi.mocked(listMyOpenMergeRequests).mockResolvedValue(mrs);
  return runSyncMineFlow({ yes: true, concurrency: 2, keepWorktrees: false, ...options }, project);
};
const branch = async (name: string, base = 'production', author?: string) => {
  await git(repos.user, 'checkout', '-q', '-b', name, base);
  if (author) await git(repos.user, 'config', 'user.email', author);
  await commitFile(repos.user, `${name.replaceAll('/', '-')}.txt`, `${name}\n`);
  if (author) await git(repos.user, 'config', 'user.email', 'axon@example.com');
  await git(repos.user, 'push', '-q', 'origin', name);
  await git(repos.user, 'checkout', '-q', 'production');
};
const advance = async (file = 'main.txt') => {
  await git(repos.other, 'checkout', '-q', 'production');
  await commitFile(repos.other, file, 'main advanced\n');
  await git(repos.other, 'push', '-q', 'origin', 'production');
  return head('production');
};
const contains = (ancestor: string, tip: string) =>
  git(repos.origin, 'merge-base', '--is-ancestor', ancestor, tip);
const clean = async () => {
  expect(await git(repos.user, 'for-each-ref', '--format=%(refname)', 'refs/heads/axon-sync')).toBe(
    '',
  );
  expect(await git(repos.user, 'worktree', 'list', '--porcelain')).not.toContain('/axon-sync/');
  expect(existsSync(path.join(repos.user, '.git', 'axon-sync.lock'))).toBe(false);
};

beforeEach(async () => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  repos = await createTestRepos();
  await git(repos.user, 'branch', 'production');
  await git(repos.user, 'branch', 'assembly');
  await git(repos.user, 'push', '-q', 'origin', 'production', 'assembly');
  await git(repos.user, 'checkout', '-q', 'production');
  await git(repos.other, 'fetch', '-q', 'origin');
  vi.mocked(checkGlabAuth).mockResolvedValue(true);
  vi.mocked(hasMrApprovals).mockResolvedValue(false);
  for (const method of ['info', 'success', 'warn', 'error'] as const) vi.spyOn(logger, method);
});
afterEach(async () => {
  if (process.env.AXON_SYNC_SUMMARY_LOG) {
    const rows = [logger.info, logger.success, logger.warn, logger.error].flatMap((method) =>
      vi.isMockFunction(method)
        ? method.mock.calls.map(([line]) => String(line)).filter((line) => /^ {2}!/.test(line))
        : [],
    );
    await appendFile(
      process.env.AXON_SYNC_SUMMARY_LOG,
      `${expect.getState().currentTestName}\n${rows.join('\n')}\n\n`,
    );
  }
  vi.restoreAllMocks();
  await repos.cleanup();
  process.exitCode = undefined;
});

describe('Classified mine policy', () => {
  it('skips configured develop targets and allows other targets', async () => {
    await branch('feat/a');
    await branch('feat/b');
    const before = await head('feat/a');
    const main = await advance();
    const warn = vi.spyOn(logger, 'warn');
    await sync([mr('1', 'feat/a', { targetBranch: 'assembly' }), mr('2', 'feat/b')]);
    expect(await head('feat/a')).toBe(before);
    await contains(main, await head('feat/b'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('targets assembly - retarget to production'),
    );
  });

  it('allows a non-main target that is not an ancestry parent', async () => {
    await branch('feat/a');
    await branch('team/target');
    const target = await head('team/target');
    await sync([mr('1', 'feat/a', { targetBranch: 'team/target' })]);
    await contains(target, await head('feat/a'));
    expect(process.exitCode).toBeUndefined();
  });

  it.each(['reachable', 'trailer'])(
    'skips %s develop commits with repair commands',
    async (kind) => {
      await git(repos.user, 'checkout', '-q', 'assembly');
      await commitFile(repos.user, 'staging.txt', 'staging\n');
      if (kind === 'trailer')
        await git(repos.user, 'commit', '--amend', '-m', 'staging\n\nStaging-MR: 10');
      else await git(repos.user, 'push', '-q', 'origin', 'assembly');
      await branch('feat/a', 'assembly');
      const before = await head('feat/a');
      const warn = vi.spyOn(logger, 'warn');
      const info = vi.spyOn(logger, 'info');
      await sync([mr('1', 'feat/a')]);
      expect(await head('feat/a')).toBe(before);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped (develop commits)'));
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('git rebase -i origin/production'),
        false,
      );
      expect(hasMrApprovals).not.toHaveBeenCalled();
    },
  );

  it('checks current MRs before QA or approvals and reports staging', async () => {
    await branch('feat/a');
    await git(repos.user, 'push', '-q', 'origin', 'feat/a:refs/staging/1');
    const success = vi.spyOn(logger, 'success');
    const heads = vi.spyOn(gitService, 'listRemoteHeads');
    const staging = vi.spyOn(gitService, 'listStagingMrs');
    await sync([mr('1', 'feat/a', { labels: ['verified'] })]);
    expect(success).toHaveBeenCalledWith(expect.stringContaining('up-to-date | staging: yes'));
    expect(hasMrApprovals).not.toHaveBeenCalled();
    expect(heads).toHaveBeenCalledTimes(1);
    expect(staging).toHaveBeenCalledTimes(1);
  });

  it('skips QA until include-qa, independently of all', async () => {
    await branch('feat/a');
    const before = await head('feat/a');
    const main = await advance();
    const warn = vi.spyOn(logger, 'warn');
    const requests = [mr('1', 'feat/a', { labels: ['verified'] })];
    await sync(requests, { all: true });
    expect(await head('feat/a')).toBe(before);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped (qa passed)'));
    expect(hasMrApprovals).not.toHaveBeenCalled();
    await sync(requests, { includeQa: true });
    await contains(main, await head('feat/a'));
    expect(hasMrApprovals).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'preserves clean approved branches (unknown=%s) until all',
    async (unknown) => {
      await branch('feat/a');
      const before = await head('feat/a');
      const main = await advance();
      if (unknown) vi.mocked(hasMrApprovals).mockRejectedValue(new Error('offline'));
      else vi.mocked(hasMrApprovals).mockResolvedValue(true);
      const warn = vi.spyOn(logger, 'warn');
      await sync([mr('1', 'feat/a')]);
      expect(await head('feat/a')).toBe(before);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('approved - no conflict'));
      if (unknown)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('(approvals unknown)'));
      await clean();
      vi.mocked(hasMrApprovals).mockClear();
      await sync([mr('1', 'feat/a')], { all: true });
      await contains(main, await head('feat/a'));
      expect(hasMrApprovals).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'reports approved conflicts without pushing (unknown=%s)',
    async (unknown) => {
      await git(repos.user, 'checkout', '-q', '-b', 'feat/a', 'production');
      await commitFile(repos.user, 'README.md', 'feature\n');
      await git(repos.user, 'push', '-q', 'origin', 'feat/a');
      await git(repos.user, 'checkout', '-q', 'production');
      const before = await head('feat/a');
      await advance('README.md');
      if (unknown) vi.mocked(hasMrApprovals).mockRejectedValue(new Error('offline'));
      else vi.mocked(hasMrApprovals).mockResolvedValue(true);
      const error = vi.spyOn(logger, 'error');
      const info = vi.spyOn(logger, 'info');
      const worktree = vi.spyOn(gitService, 'addDetachedWorktree');
      await sync([mr('1', 'feat/a')]);
      expect(await head('feat/a')).toBe(before);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('conflict - rebase manually, approvals will reset'),
      );
      if (unknown)
        expect(error).toHaveBeenCalledWith(expect.stringContaining('(approvals unknown)'));
      expect(info).toHaveBeenCalledWith(expect.stringContaining('axon sb production'), false);
      expect(worktree).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      await clean();
    },
  );

  it.each(['fixup!', 'squash!', 'amend!'])(
    'autosquashes %s even when already current and removes worktrees',
    async (prefix) => {
      await branch('feat/a');
      await git(repos.user, 'checkout', '-q', 'feat/a');
      const subject = await git(repos.user, 'log', '-1', '--format=%s');
      await commitFile(repos.user, 'extra.txt', 'extra\n');
      await git(repos.user, 'commit', '--amend', '-m', `${prefix} ${subject}`);
      await git(repos.user, 'push', '-q', 'origin', 'feat/a');
      await git(repos.user, 'checkout', '-q', 'production');
      const replay = vi.spyOn(gitService, 'replayOnto');
      const worktree = vi.spyOn(gitService, 'rebaseWorktreeOnto');
      await sync([mr('1', 'feat/a')]);
      expect(replay).not.toHaveBeenCalled();
      expect(worktree).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ autosquash: true }),
      );
      const subjects = await git(repos.origin, 'log', '--format=%s', 'production..feat/a');
      expect(subjects).not.toMatch(/^(fixup!|squash!|amend!) /m);
      expect(await git(repos.origin, 'rev-list', '--count', 'production..feat/a')).toBe('1');
      await clean();
    },
  );

  it('refuses to push fixups whose target commit is absent', async () => {
    await branch('feat/a');
    await git(repos.user, 'checkout', '-q', 'feat/a');
    await commitFile(repos.user, 'extra.txt', 'extra\n');
    await git(repos.user, 'commit', '--amend', '-m', 'fixup! nonexistent');
    await git(repos.user, 'push', '-q', 'origin', 'feat/a');
    await git(repos.user, 'checkout', '-q', 'production');
    const before = await head('feat/a');
    await sync([mr('1', 'feat/a')]);
    expect(await head('feat/a')).toBe(before);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Not pushing: fixup or merge commits remain'),
    );
    expect(process.exitCode).toBe(1);
    await clean();
  });

  it('reports staging for runs with only filtered MRs', async () => {
    await branch('feat/a');
    await git(repos.user, 'push', '-q', 'origin', 'feat/a:refs/staging/1');
    const staging = vi.spyOn(gitService, 'listStagingMrs');
    await sync([mr('1', 'feat/a', { targetBranch: 'assembly' })]);
    expect(staging).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('staging: yes'));
    expect(hasMrApprovals).not.toHaveBeenCalled();
  });

  it('reports staging failures as informational, without stopping sync', async () => {
    await branch('feat/a');
    const main = await advance();
    vi.spyOn(gitService, 'listStagingMrs').mockRejectedValueOnce(new Error('offline'));
    await sync([mr('1', 'feat/a')]);
    await contains(main, await head('feat/a'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Staging status unavailable'));
    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('staging: unknown'));
    expect(process.exitCode).toBeUndefined();
  });

  it('uses the default qa::passed label', async () => {
    await git(repos.user, 'branch', 'main', 'production');
    await git(repos.user, 'push', '-q', 'origin', 'main');
    await branch('feat/a');
    await advance();
    await git(repos.other, 'push', '-q', 'origin', 'production:main');
    const before = await head('feat/a');
    await sync(
      [mr('1', 'feat/a', { targetBranch: 'main', labels: ['qa::passed'] })],
      {},
      projectContext({ version: 1, flow: 'classified' }),
    );
    expect(await head('feat/a')).toBe(before);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('skipped (qa passed)'));
    expect(hasMrApprovals).not.toHaveBeenCalled();
  });

  it('aborts conflicting fixup autosquash without pushing or leaving worktrees', async () => {
    await branch('feat/a');
    await git(repos.user, 'checkout', '-q', 'feat/a');
    const subject = await git(repos.user, 'log', '-1', '--format=%s');
    await commitFile(repos.user, 'README.md', 'feature\n');
    await git(repos.user, 'commit', '--amend', '-m', `fixup! ${subject}`);
    await git(repos.user, 'push', '-q', 'origin', 'feat/a');
    await git(repos.user, 'checkout', '-q', 'production');
    const before = await head('feat/a');
    await advance('README.md');
    await sync([mr('1', 'feat/a')]);
    expect(await head('feat/a')).toBe(before);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed (conflict)'));
    expect(process.exitCode).toBe(1);
    await clean();
  });

  it('cancels approvals and queued candidates cleanly', async () => {
    await branch('feat/a');
    await branch('feat/b');
    await advance();
    const exit = vi.fn();
    const interrupt = createInterruptHandler({ exit, stdout: vi.fn(), stderr: vi.fn() });
    let cleanup: Promise<void> | undefined;
    vi.mocked(hasMrApprovals).mockImplementationOnce(async (_mr, signal) => {
      cleanup = interrupt();
      expect(signal.aborted).toBe(true);
      throw new Error('cancelled');
    });
    const before = await head('feat/a');
    await sync([mr('1', 'feat/a'), mr('2', 'feat/b')], { concurrency: 1 });
    await cleanup;
    expect(await head('feat/a')).toBe(before);
    expect(hasMrApprovals).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(130);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('interrupted (Ctrl+C)'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('not run (interrupted)'));
    await clean();
  });

  it('bounds approvals calls by concurrency and only queries candidates', async () => {
    for (const name of ['a', 'b', 'c', 'd']) await branch(`feat/${name}`);
    await advance();
    let active = 0;
    let peak = 0;
    vi.mocked(hasMrApprovals).mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active--;
      return false;
    });
    await sync(
      ['a', 'b', 'c', 'd'].map((name, index) =>
        mr(String(index), `feat/${name}`, { labels: name === 'd' ? ['verified'] : [] }),
      ),
    );
    expect(peak).toBe(2);
    expect(hasMrApprovals).toHaveBeenCalledTimes(3);
  });
});

describe('Classified ancestry', () => {
  it('forms an atomic stack from main-target MRs', async () => {
    await branch('feat/parent');
    await branch('feat/child', 'feat/parent');
    const main = await advance();
    const push = vi.spyOn(gitService, 'pushWithLeases');
    await sync([mr('1', 'feat/parent'), mr('2', 'feat/child')]);
    const parent = await head('feat/parent');
    await contains(main, parent);
    await contains(parent, await head('feat/child'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].map((update) => update.branch)).toEqual([
      'feat/parent',
      'feat/child',
    ]);
    expect(push.mock.calls[0][1]).toMatchObject({ atomic: true });
    expect(await git(repos.origin, 'rev-list', '--count', 'feat/parent..feat/child')).toBe('1');
  });

  it.each(['qa', 'approved'])('uses unchanged heads of %s skipped parents', async (policy) => {
    await branch('feat/parent');
    await branch('feat/child', 'feat/parent');
    await git(repos.user, 'checkout', '-q', 'feat/child');
    const subject = await git(repos.user, 'log', '-1', '--format=%s');
    await commitFile(repos.user, 'extra.txt', 'extra\n');
    await git(repos.user, 'commit', '--amend', '-m', `fixup! ${subject}`);
    await git(repos.user, 'push', '-q', 'origin', 'feat/child');
    await git(repos.user, 'checkout', '-q', 'production');
    const before = await head('feat/parent');
    await advance();
    vi.mocked(hasMrApprovals).mockImplementation(
      async (request) => policy === 'approved' && request.iid === '1',
    );
    const push = vi.spyOn(gitService, 'pushWithLeases');
    await sync([
      mr('1', 'feat/parent', { labels: policy === 'qa' ? ['verified'] : [] }),
      mr('2', 'feat/child'),
    ]);
    expect(await head('feat/parent')).toBe(before);
    await contains(before, await head('feat/child'));
    expect(await git(repos.origin, 'rev-list', '--count', 'feat/parent..feat/child')).toBe('1');
    expect(push.mock.calls[0][0].map((update) => update.branch)).toEqual(['feat/child']);
  });

  it('fetches teammate parent, uses its newest head and never pushes it', async () => {
    await branch('team/parent', 'production', 'teammate@example.com');
    await branch('feat/child', 'team/parent');
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'team/parent');
    const newest = await commitFile(repos.other, 'team-new.txt', 'team\n');
    await advance();
    const listHeads = gitService.listRemoteHeads;
    vi.spyOn(gitService, 'listRemoteHeads').mockImplementationOnce(async (options) => {
      const heads = await listHeads(options);
      await git(repos.other, 'push', '-q', 'origin', `${newest}:team/parent`);
      return heads;
    });
    const push = vi.spyOn(gitService, 'pushWithLeases');
    await sync([mr('1', 'feat/child')]);
    expect(await head('team/parent')).toBe(newest);
    await contains(newest, await head('feat/child'));
    expect(push.mock.calls[0][0].map((update) => update.branch)).toEqual(['feat/child']);
  });

  it('rejects an entire ancestry stack when a child lease changes', async () => {
    await branch('feat/parent');
    await branch('feat/child', 'feat/parent');
    const parentBefore = await head('feat/parent');
    await advance();
    await git(repos.other, 'fetch', '-q', 'origin');
    await git(repos.other, 'checkout', '-q', 'feat/child');
    const concurrent = await commitFile(repos.other, 'concurrent.txt', 'concurrent\n');
    const push = gitService.pushWithLeases;
    vi.spyOn(gitService, 'pushWithLeases').mockImplementationOnce(async (updates, options) => {
      await git(repos.other, 'push', '-q', 'origin', 'feat/child');
      return push(updates, options);
    });
    const error = vi.spyOn(logger, 'error');
    const warn = vi.spyOn(logger, 'warn');
    await sync([mr('1', 'feat/parent'), mr('2', 'feat/child')]);
    expect(await head('feat/parent')).toBe(parentBefore);
    expect(await head('feat/child')).toBe(concurrent);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('failed (remote changed)'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped (stack rejected)'));
    expect(process.exitCode).toBe(1);
    await clean();
  });

  it('chooses the nearest of multiple ancestor heads', async () => {
    await branch('feat/root');
    await branch('feat/parent', 'feat/root');
    await branch('feat/child', 'feat/parent');
    await advance();
    await sync([mr('3', 'feat/child'), mr('2', 'feat/parent'), mr('1', 'feat/root')]);
    await contains(await head('feat/root'), await head('feat/parent'));
    await contains(await head('feat/parent'), await head('feat/child'));
    expect(await git(repos.origin, 'rev-list', '--count', 'feat/parent..feat/child')).toBe('1');
  });

  it('skips ambiguous independent ancestor heads', async () => {
    await branch('team/a');
    await branch('team/b');
    await git(repos.user, 'checkout', '-q', '-b', 'feat/child', 'team/a');
    await git(repos.user, 'merge', '-q', '--no-ff', '--no-edit', 'team/b');
    await commitFile(repos.user, 'child.txt', 'child\n');
    await git(repos.user, 'push', '-q', 'origin', 'feat/child');
    await git(repos.user, 'checkout', '-q', 'production');
    const before = await head('feat/child');
    const warn = vi.spyOn(logger, 'warn');
    await sync([mr('1', 'feat/child')]);
    expect(await head('feat/child')).toBe(before);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ambiguous base: team/a, team/b'));
    expect(hasMrApprovals).not.toHaveBeenCalled();
  });

  it('skips foreign commits after parent force-push removes the ancestor head', async () => {
    await branch('team/parent', 'production', 'teammate@example.com');
    await branch('feat/child', 'team/parent');
    await git(repos.user, 'push', '-q', '--force', 'origin', 'production:team/parent');
    await advance();
    const before = await head('feat/child');
    const warn = vi.spyOn(logger, 'warn');
    await sync([mr('1', 'feat/child')]);
    expect(await head('feat/child')).toBe(before);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("contains others' commits - run axon sb in that branch"),
    );
    expect(hasMrApprovals).not.toHaveBeenCalled();
  });

  it('ignores remote heads with objects unavailable locally', async () => {
    await branch('feat/a');
    await git(repos.other, 'checkout', '-q', '-b', 'team/unseen', 'origin/production');
    await commitFile(repos.other, 'unseen.txt', 'unseen\n');
    await git(repos.other, 'push', '-q', 'origin', 'team/unseen');
    const unseen = await head('team/unseen');
    const main = await advance();
    await sync([mr('1', 'feat/a')]);
    await contains(main, await head('feat/a'));
    await expect(git(repos.user, 'cat-file', '-e', unseen)).rejects.toThrow();
  });
});
