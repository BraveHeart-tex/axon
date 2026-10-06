import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runFeatureFlow } from '@/domains/feature/feature.service.js';
import { resolveBranchMeta } from '@/domains/feature/flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from '@/domains/feature/flows/resolveIssueKey.flow.js';
import { remoteBranchExists } from '@/domains/git/git.service.js';
import { getProjectConfigPathForId, saveProjectConfig } from '@/domains/project/project.service.js';

import { commitFile, createTestRepos, git, type TestRepos } from './helpers/gitRepos.js';
import { projectContext } from './helpers/projectContext.js';

vi.mock('@/domains/feature/flows/resolveBranchMeta.flow.js', () => ({
  resolveBranchMeta: vi.fn(),
}));
vi.mock('@/domains/feature/flows/resolveIssueKey.flow.js', () => ({ resolveIssueKey: vi.fn() }));
vi.mock('@/domains/git/git.service.js', async (original) => ({
  ...(await original<typeof import('@/domains/git/git.service.js')>()),
  remoteBranchExists: vi.fn(),
}));

const cli = path.resolve('src/bin/cli.ts');
const tsx = path.resolve('node_modules/tsx/dist/loader.mjs');
const tsconfig = path.resolve('tsconfig.json');
let repos: TestRepos;

describe('Phase 2 scratch repos', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    repos = await createTestRepos();
    await git(repos.user, 'branch', 'main');
    await git(repos.user, 'push', 'origin', 'main');
    await commitFile(repos.user, 'staging.txt', 'develop-only\n');
    await git(repos.user, 'push', 'origin', 'develop');
    vi.mocked(resolveIssueKey).mockResolvedValue({ issueKey: 'APP-7' });
    vi.mocked(resolveBranchMeta).mockResolvedValue({ commitLabel: 'feat', slug: 'retry' });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repos.cleanup();
  });

  it('classified branches from origin/main even when develop exists, without probing develop', async () => {
    const context = projectContext({
      version: 1,
      flow: 'classified',
      branchTemplate: '{key}-{slug}',
      jira: { projectKeys: ['APP'] },
    });
    await runFeatureFlow(context);
    expect(await git(repos.user, 'branch', '--show-current')).toBe('APP-7-retry');
    expect(await git(repos.user, 'rev-parse', 'HEAD')).toBe(
      await git(repos.user, 'rev-parse', 'origin/main'),
    );
    expect(remoteBranchExists).not.toHaveBeenCalled();
    const upstream = await execa('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], {
      cwd: repos.user,
      reject: false,
    });
    expect(upstream.exitCode).not.toBe(0);
  });

  it('classified uses configured origin/main even with unpublished local main commits', async () => {
    await git(repos.user, 'branch', 'production', 'main');
    await git(repos.user, 'push', 'origin', 'production');
    await git(repos.user, 'checkout', 'production');
    await commitFile(repos.user, 'unpublished.txt', 'local-only\n');
    const localMain = await git(repos.user, 'rev-parse', 'production');
    await runFeatureFlow(
      projectContext({ version: 1, flow: 'classified', classified: { mainBranch: 'production' } }),
    );
    expect(await git(repos.user, 'rev-parse', 'HEAD')).toBe(
      await git(repos.user, 'rev-parse', 'origin/production'),
    );
    expect(await git(repos.user, 'rev-parse', 'production')).toBe(localMain);
    expect(remoteBranchExists).not.toHaveBeenCalled();
    const upstream = await execa('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], {
      cwd: repos.user,
      reject: false,
    });
    expect(upstream.exitCode).not.toBe(0);
  });

  it('gitflow uses configured develop', async () => {
    await git(repos.user, 'branch', 'integration');
    await git(repos.user, 'push', 'origin', 'integration');
    vi.mocked(remoteBranchExists).mockResolvedValue(true);
    await runFeatureFlow(
      projectContext({
        version: 1,
        flow: 'gitflow',
        gitflow: { mainBranch: 'production', developBranch: 'integration' },
      }),
    );
    expect(remoteBranchExists).toHaveBeenCalledWith('integration');
    expect(await git(repos.user, 'rev-parse', 'HEAD')).toBe(
      await git(repos.user, 'rev-parse', 'origin/integration'),
    );
  });

  it('gitflow falls back to configured main when develop is absent', async () => {
    await git(repos.user, 'branch', 'production', 'main');
    await git(repos.user, 'push', 'origin', 'production');
    vi.mocked(remoteBranchExists).mockResolvedValue(false);
    await runFeatureFlow(
      projectContext({
        version: 1,
        flow: 'gitflow',
        gitflow: { mainBranch: 'production', developBranch: 'integration' },
      }),
    );
    expect(await git(repos.user, 'rev-parse', 'HEAD')).toBe(
      await git(repos.user, 'rev-parse', 'origin/production'),
    );
  });

  it('no config still branches from develop', async () => {
    vi.mocked(remoteBranchExists).mockResolvedValue(true);
    await runFeatureFlow(projectContext());
    expect(await git(repos.user, 'branch', '--show-current')).toBe('feat/APP-7-retry');
    expect(await git(repos.user, 'rev-parse', 'HEAD')).toBe(
      await git(repos.user, 'rev-parse', 'origin/develop'),
    );
  });

  it('classified release CLI exits 1 with the merge train explanation before prompts', async () => {
    vi.stubEnv('AXON_CONFIG_DIR', path.join(repos.user, '.axon-test'));
    await git(repos.user, 'config', 'axon.project', 'classified-test');
    saveProjectConfig(getProjectConfigPathForId('classified-test'), {
      version: 1,
      flow: 'classified',
    });
    const result = await execa(process.execPath, ['--import', tsx, cli, 'release'], {
      cwd: repos.user,
      reject: false,
      env: { TSX_TSCONFIG_PATH: tsconfig },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "axon release isn't used in the classified flow. MRs ship to main via the merge train.",
    );
    expect(await git(repos.user, 'branch', '--show-current')).toBe('develop');
  });
});
