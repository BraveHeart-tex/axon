import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkbox, confirm } from '@inquirer/prompts';
import c from 'ansi-colors';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildHookCatalog, HOOKS, wrapScript } from '@/domains/hooks/hooks.constants.js';
import { runHooksFlow } from '@/domains/hooks/hooks.flow.js';

import { commitFile, git } from './helpers/gitRepos.js';
import { projectContext } from './helpers/projectContext.js';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
}));

type Choice = { value: (typeof HOOKS)[number]; checked: boolean };

const mockedCheckbox = vi.mocked(checkbox);

const getHook = (id: string) => {
  const hook = HOOKS.find((candidate) => candidate.id === id);
  if (!hook) throw new Error(`Missing hook ${id}`);
  return hook;
};

const selectHooks = (ids: string[]) => {
  mockedCheckbox.mockResolvedValueOnce(ids.map(getHook) as never);
};

const keepInstalledSelection = () => {
  mockedCheckbox.mockImplementationOnce((async ({ choices }: { choices: Choice[] }) =>
    choices.filter((choice) => choice.checked).map((choice) => choice.value)) as never);
};

const writeHookFile = (dir: string, hookFile: string, blocks: { id: string; script: string }[]) => {
  fs.mkdirSync(dir, { recursive: true });
  const content = ['#!/usr/bin/env sh', ...blocks.map((block) => wrapScript(block).trim())].join(
    '\n\n',
  );
  fs.writeFileSync(path.join(dir, hookFile), `${content}\n`, { mode: 0o755 });
};

const loggedLines = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((args) => c.unstyle(String(args[0])));

const installHuskyShim = (worktree: string, hookFile: string, marker: string) => {
  const shimDir = path.join(worktree, '.husky', '_');
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(path.join(shimDir, '.gitignore'), '*\n');
  fs.writeFileSync(path.join(shimDir, hookFile), `#!/usr/bin/env sh\necho "${marker}"\n`, {
    mode: 0o755,
  });
};

let root: string;
let repo: string;
let previousCwd: string;

describe('runHooksFlow against real repos', () => {
  beforeEach(async () => {
    previousCwd = process.cwd();
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'axon-hooks-flow-')));
    repo = path.join(root, 'repo');
    const globalConfig = path.join(root, 'gitconfig');
    fs.writeFileSync(
      globalConfig,
      [
        '[user]',
        '  name = Axon Test',
        '  email = axon@example.com',
        '[init]',
        '  defaultBranch = main',
      ].join('\n'),
    );
    vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig);
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
    await execa('git', ['init', repo]);
    await commitFile(repo, 'README.md', 'base\n');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('installs hooks into the common git dir from a linked worktree', async () => {
    const worktree = path.join(root, 'worktree');
    await git(repo, 'worktree', 'add', '-q', '-b', 'feature/ORD-123-checkout', worktree);
    process.chdir(worktree);
    selectHooks(['warn-jira-mismatch']);

    await runHooksFlow(projectContext());

    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    expect(fs.existsSync(path.join(hooksDir, 'commit-msg'))).toBe(true);
    expect(await git(worktree, 'config', '--local', '--get', 'core.hooksPath')).toBe(hooksDir);
    expect(await git(repo, 'config', '--local', '--get', 'core.hooksPath')).toBe(hooksDir);

    const result = await execa('git', ['commit', '--allow-empty', '-m', 'fix: DIS-456 retry'], {
      cwd: worktree,
      all: true,
    });
    expect(result.all).toContain('Branch Jira key: ORD-123');
    expect(result.all).toContain('Commit Jira key: DIS-456');
  });

  it('keeps the husky chain when only the main worktree has the husky shim', async () => {
    installHuskyShim(repo, 'commit-msg', 'husky ran in main');
    await git(repo, 'config', '--local', 'core.hooksPath', '.husky/_');
    const worktree = path.join(root, 'worktree');
    await git(repo, 'worktree', 'add', '-q', '-b', 'feature/ORD-123-checkout', worktree);
    expect(fs.existsSync(path.join(worktree, '.husky'))).toBe(false);
    process.chdir(worktree);
    selectHooks(['warn-jira-mismatch']);

    await runHooksFlow(projectContext());

    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    const commitMsg = fs.readFileSync(path.join(hooksDir, 'commit-msg'), 'utf8');
    expect(commitMsg).toContain('".husky/_/commit-msg" "$@" || exit $?');
    expect(await git(repo, 'config', '--local', '--get', 'core.hooksPath')).toBe(hooksDir);

    const mainCommit = await execa('git', ['commit', '--allow-empty', '-m', 'fix: ORD-123 main'], {
      cwd: repo,
      all: true,
    });
    expect(mainCommit.all).toContain('husky ran in main');

    selectHooks([]);
    await runHooksFlow(projectContext());

    expect(fs.existsSync(path.join(hooksDir, 'commit-msg'))).toBe(false);
    expect(await git(worktree, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_');

    installHuskyShim(worktree, 'commit-msg', 'husky ran in worktree');
    const worktreeCommit = await execa(
      'git',
      ['commit', '--allow-empty', '-m', 'fix: ORD-123 worktree'],
      { cwd: worktree, all: true },
    );
    expect(worktreeCommit.all).toContain('husky ran in worktree');
    expect(worktreeCommit.all).not.toContain('husky ran in main');
  });

  it('rewrites the legacy relative hooks path to the absolute common dir', async () => {
    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    writeHookFile(hooksDir, 'prepare-commit-msg', [getHook('block-amend')]);
    await git(repo, 'config', '--local', 'core.hooksPath', '.git/axon-hooks');
    process.chdir(repo);
    keepInstalledSelection();

    await runHooksFlow(projectContext());

    expect(fs.existsSync(path.join(hooksDir, 'prepare-commit-msg'))).toBe(true);
    expect(await git(repo, 'config', '--local', '--get', 'core.hooksPath')).toBe(hooksDir);
  });

  it('removes installed blocks that are no longer in the catalog', async () => {
    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    const jiraHook = getHook('warn-jira-mismatch');
    writeHookFile(hooksDir, 'post-commit', [{ id: 'suggest-sync', script: 'echo sync' }]);
    writeHookFile(hooksDir, 'commit-msg', [jiraHook, { id: 'retired-hook', script: 'echo old' }]);
    await git(repo, 'config', '--local', 'core.hooksPath', hooksDir);
    process.chdir(repo);
    keepInstalledSelection();

    await runHooksFlow(projectContext());

    expect(fs.existsSync(path.join(hooksDir, 'post-commit'))).toBe(false);
    const commitMsg = fs.readFileSync(path.join(hooksDir, 'commit-msg'), 'utf8');
    expect(commitMsg).toContain('# AXON_START: warn-jira-mismatch');
    expect(commitMsg).not.toContain('retired-hook');
    expect(loggedLines(vi.mocked(console.log))).toEqual(
      expect.arrayContaining([
        '✘ suggest-sync: removed (obsolete)',
        '✘ retired-hook: removed (obsolete)',
      ]),
    );
    expect(await git(repo, 'config', '--local', '--get', 'core.hooksPath')).toBe(hooksDir);
  });

  it('no longer offers suggest-sync', () => {
    expect(HOOKS.map((hook) => hook.id)).not.toContain('suggest-sync');
  });
  it.each([true, false])('offers removal of incompatible hooks, accepted=%s', async (accepted) => {
    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    writeHookFile(hooksDir, 'prepare-commit-msg', [getHook('block-amend')]);
    process.chdir(repo);
    vi.mocked(confirm).mockResolvedValueOnce(accepted);
    selectHooks(['warn-jira-mismatch']);
    const context = projectContext({ version: 1, flow: 'classified' });

    await runHooksFlow(context);

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Block Amends on Release') }),
    );
    const choices = mockedCheckbox.mock.calls.at(-1)![0].choices as Choice[];
    expect(choices.map((choice) => choice.value.id)).toEqual(['warn-jira-mismatch']);
    expect(fs.existsSync(path.join(hooksDir, 'prepare-commit-msg'))).toBe(!accepted);
    expect(fs.existsSync(path.join(hooksDir, 'commit-msg'))).toBe(true);
  });

  it('refreshes installed hooks after project keys change', async () => {
    process.chdir(repo);
    selectHooks(['warn-jira-mismatch']);
    await runHooksFlow(projectContext());
    keepInstalledSelection();
    const context = projectContext({
      version: 1,
      flow: 'classified',
      jira: { projectKeys: ['APP', 'WEB2'] },
    });
    await runHooksFlow(context);
    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    const script = fs.readFileSync(path.join(hooksDir, 'commit-msg'), 'utf8');
    expect(script).toContain('(APP|WEB2)');
    expect(script).not.toContain('(FE|ORD|');
    await git(repo, 'checkout', '-b', 'feat/APP-7-retry');
    const result = await execa('git', ['commit', '--allow-empty', '-m', 'fix: WEB2-8 retry'], {
      cwd: repo,
      all: true,
    });
    expect(result.all).toContain('Branch Jira key: APP-7');
    expect(result.all).toContain('Commit Jira key: WEB2-8');
    expect(loggedLines(vi.mocked(console.log))).toContain(
      '  re-run axon hooks after changing jira.projectKeys',
    );
  });

  it('writes nothing when the picker is cancelled after accepting removal', async () => {
    const hooksDir = path.join(repo, '.git', 'axon-hooks');
    writeHookFile(hooksDir, 'prepare-commit-msg', [getHook('block-amend')]);
    const original = fs.readFileSync(path.join(hooksDir, 'prepare-commit-msg'), 'utf8');
    process.chdir(repo);
    vi.mocked(confirm).mockResolvedValueOnce(true);
    mockedCheckbox.mockRejectedValueOnce(new Error('cancelled'));
    await expect(runHooksFlow(projectContext({ version: 1, flow: 'classified' }))).rejects.toThrow(
      'cancelled',
    );
    expect(fs.readFileSync(path.join(hooksDir, 'prepare-commit-msg'), 'utf8')).toBe(original);
  });

  it('uses a literal configured release prefix in the shell script', async () => {
    const context = projectContext({
      version: 1,
      flow: 'gitflow',
      gitflow: { releasePrefix: "ship/'$value/" },
    });
    const hook = buildHookCatalog(context).find((hook) => hook.id === 'block-amend')!;
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'ps'), '#!/bin/sh\necho git commit --amend\n', { mode: 0o755 });
    await git(repo, 'checkout', '-b', "ship/'$value/urgent");
    const result = await execa('sh', ['-c', hook.script], {
      cwd: repo,
      reject: false,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('AMEND BLOCKED');
    await git(repo, 'checkout', '-b', 'release/urgent');
    const other = await execa('sh', ['-c', hook.script], {
      cwd: repo,
      reject: false,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    expect(other.exitCode).toBe(0);
  });
});
