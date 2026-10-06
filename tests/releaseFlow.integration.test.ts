import { input } from '@inquirer/prompts';
import inquirer from 'inquirer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleMrUrlGeneration } from '@/domains/mr/flows/mrUrl.flow.js';
import { runReleaseFlow } from '@/domains/release/release.service.js';
import { promptSearchableCommitCheckbox } from '@/ui/prompts/commit.prompts.js';

import { commitFile, createTestRepos, git, type TestRepos } from './helpers/gitRepos.js';
import { projectContext } from './helpers/projectContext.js';

vi.mock('@inquirer/prompts', () => ({ input: vi.fn() }));
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
vi.mock('@/ui/prompts/commit.prompts.js', () => ({ promptSearchableCommitCheckbox: vi.fn() }));
vi.mock('@/domains/mr/flows/mrUrl.flow.js', () => ({ handleMrUrlGeneration: vi.fn() }));

let repos: TestRepos;

describe('gitflow releases in scratch repos', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    repos = await createTestRepos();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await repos.cleanup();
  });

  it.each([false, true])(
    'uses configured branches, prefix and Jira scope, custom=%s',
    async (custom) => {
      const context = custom
        ? projectContext({
            version: 1,
            flow: 'gitflow',
            gitflow: {
              mainBranch: 'production',
              developBranch: 'integration',
              releasePrefix: 'ship/',
            },
            jira: { projectKeys: ['APP'] },
          })
        : projectContext();
      if (context.flow.name !== 'gitflow') throw new Error('Expected gitflow');
      const { mainBranch, developBranch, releasePrefix } = context.flow;
      await git(repos.user, 'branch', mainBranch);
      await git(repos.user, 'push', 'origin', mainBranch);
      if (developBranch !== 'develop') await git(repos.user, 'branch', '-m', developBranch);
      await commitFile(repos.user, 'fix.txt', 'fix\n');
      const key = custom ? 'APP-7' : 'ORD-7';
      await git(repos.user, 'commit', '--amend', '-m', `fix: ${key} retry`);
      const hash = await git(repos.user, 'rev-parse', '--short', 'HEAD');
      await git(repos.user, 'push', 'origin', developBranch);
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ pickMethod: 'list' })
        .mockResolvedValueOnce({ confirmed: true });
      vi.mocked(promptSearchableCommitCheckbox).mockResolvedValueOnce([hash]);
      vi.mocked(input).mockResolvedValueOnce(key);

      await runReleaseFlow({ author: '' }, context);

      expect(input).toHaveBeenCalledWith(expect.objectContaining({ default: key }));
      expect(await git(repos.user, 'branch', '--show-current')).toBe(`${releasePrefix}${key}`);
      expect(await git(repos.user, 'rev-parse', 'HEAD^')).toBe(
        await git(repos.user, 'rev-parse', `origin/${mainBranch}`),
      );
      expect(await git(repos.user, 'log', '-1', '--format=%s')).toBe(`fix: ${key} retry`);
      expect(handleMrUrlGeneration).toHaveBeenCalledWith({
        sourceBranch: `${releasePrefix}${key}`,
        targetBranch: mainBranch,
      });
    },
  );

  it('manual selection uses the configured prefix and main branch', async () => {
    const context = projectContext({
      version: 1,
      flow: 'gitflow',
      gitflow: { mainBranch: 'production', developBranch: 'absent', releasePrefix: 'ship-' },
    });
    await git(repos.user, 'branch', 'production');
    await git(repos.user, 'push', 'origin', 'production');
    const hash = await commitFile(repos.user, 'fix.txt', 'fix\n');
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ pickMethod: 'manual' })
      .mockResolvedValueOnce({ commitHashes: hash })
      .mockResolvedValueOnce({ title: 'urgent' })
      .mockResolvedValueOnce({ confirmed: true });

    await runReleaseFlow({ author: '' }, context);

    expect(await git(repos.user, 'branch', '--show-current')).toBe('ship-urgent');
    expect(await git(repos.user, 'rev-parse', 'HEAD^')).toBe(
      await git(repos.user, 'rev-parse', 'origin/production'),
    );
    expect(handleMrUrlGeneration).toHaveBeenCalledWith({
      sourceBranch: 'ship-urgent',
      targetBranch: 'production',
    });
  });
});
