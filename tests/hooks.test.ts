import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HOOKS } from '@/domains/hooks/hooks.constants.js';
import { JIRA_PROJECT_LABELS, JIRA_REGEX } from '@/domains/jira/jira.constants.js';

const temporaryDirectories: string[] = [];
const jiraMismatchHook = HOOKS.find((hook) => hook.id === 'warn-jira-mismatch');

if (!jiraMismatchHook) {
  throw new Error('Jira mismatch hook definition is missing');
}

const runGit = (repository: string, args: string[]) =>
  execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const createRepository = (branchName: string) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-hooks-'));
  temporaryDirectories.push(repository);
  runGit(repository, ['init', '--initial-branch', branchName]);
  return repository;
};

const runHook = ({
  branchName,
  commitMessage,
  prepareRepository,
}: {
  branchName: string;
  commitMessage: string;
  prepareRepository?: (repository: string) => void;
}) => {
  const repository = createRepository(branchName);
  const messageFile = path.join(repository, 'COMMIT_EDITMSG');
  fs.writeFileSync(messageFile, commitMessage);
  prepareRepository?.(repository);

  const result = execFileSync(
    'sh',
    ['-c', jiraMismatchHook.script, 'axon-jira-mismatch', messageFile],
    {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return result;
};

const createCommit = (repository: string) => {
  runGit(repository, ['config', 'user.name', 'Axon Tests']);
  runGit(repository, ['config', 'user.email', 'axon@example.com']);
  runGit(repository, ['commit', '--allow-empty', '--no-verify', '--message', 'test commit']);
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Jira constants', () => {
  it('builds the Jira regex from the supported uppercase project labels', () => {
    expect(JIRA_PROJECT_LABELS).toEqual(['FE', 'ORD', 'DIS', 'PE', 'PRD', 'MEM', 'MOD']);

    for (const label of JIRA_PROJECT_LABELS) {
      expect(JIRA_REGEX.test(`${label}-123`)).toBe(true);
    }

    expect(JIRA_REGEX.test('ord-123')).toBe(false);
    expect(JIRA_REGEX.test('ABC-123')).toBe(false);
  });
});

describe('Jira mismatch hook', () => {
  it('does not warn when the first Jira keys match', () => {
    const output = runHook({
      branchName: 'feature/ORD-123-DIS-456',
      commitMessage: 'fix: handle ORD-123 before FE-789',
    });

    expect(output).toBe('');
  });

  it('warns and exits successfully when the Jira keys differ', () => {
    const output = runHook({
      branchName: 'feature/ORD-123-checkout',
      commitMessage: 'fix: handle DIS-456 payment retry',
    });

    expect(output).toContain('⚠  AXON · JIRA MISMATCH');
    expect(output).toContain('Branch Jira key: ORD-123');
    expect(output).toContain('Commit Jira key: DIS-456');
    expect(output).toContain('Commit will continue.');
    expect(output).toContain('Verify the branch name or commit message');
  });

  it('warns when only the branch has a Jira key', () => {
    const output = runHook({
      branchName: 'feature/ORD-123-checkout',
      commitMessage: 'fix: handle payment retry',
    });

    expect(output).toContain('Branch Jira key: ORD-123');
    expect(output).toContain('Commit Jira key: none');
  });

  it('warns when only the commit message has a Jira key', () => {
    const output = runHook({
      branchName: 'main',
      commitMessage: 'fix: handle ORD-123 payment retry',
    });

    expect(output).toContain('Branch Jira key: none');
    expect(output).toContain('Commit Jira key: ORD-123');
  });

  it('does not warn when neither side has a Jira key', () => {
    const output = runHook({
      branchName: 'feature/checkout',
      commitMessage: 'fix: handle payment retry',
    });

    expect(output).toBe('');
  });

  it('skips detached HEAD commits', () => {
    const output = runHook({
      branchName: 'feature/ORD-123-checkout',
      commitMessage: 'fix: handle DIS-456 payment retry',
      prepareRepository: (repository) => {
        createCommit(repository);
        runGit(repository, ['checkout', '--detach']);
      },
    });

    expect(output).toBe('');
  });

  it('skips merge commits', () => {
    const output = runHook({
      branchName: 'feature/ORD-123-checkout',
      commitMessage: 'Merge branch main with DIS-456',
      prepareRepository: (repository) => {
        createCommit(repository);
        const gitDirectory = runGit(repository, ['rev-parse', '--git-dir']);
        const headCommit = runGit(repository, ['rev-parse', 'HEAD']);
        fs.writeFileSync(path.resolve(repository, gitDirectory, 'MERGE_HEAD'), `${headCommit}\n`);
      },
    });

    expect(output).toBe('');
  });
});
