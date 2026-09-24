import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { vi } from 'vitest';

export type TestRepos = {
  origin: string;
  user: string;
  other: string;
  cleanup: () => Promise<void>;
};

export const git = async (cwd: string, ...args: string[]) => {
  const { stdout } = await execa('git', args, { cwd });
  return stdout.trim();
};

export const commitFile = async (cwd: string, file: string, content: string) => {
  await writeFile(path.join(cwd, file), content);
  await git(cwd, 'add', file);
  await git(cwd, 'commit', '-m', `edit ${file}`);
  return git(cwd, 'rev-parse', 'HEAD');
};

// A bare origin plus two clones: `user` is where axon runs, `other` stands in for a second
// machine or teammate. The process chdirs into `user`; `cleanup` restores it.
export const createTestRepos = async (): Promise<TestRepos> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axon-sync-'));
  const origin = path.join(root, 'origin.git');
  const user = path.join(root, 'user');
  const other = path.join(root, 'other');
  const globalConfig = path.join(root, 'gitconfig');
  const previousCwd = process.cwd();

  await writeFile(
    globalConfig,
    [
      '[user]',
      '  name = Axon Test',
      '  email = axon@example.com',
      '[init]',
      '  defaultBranch = develop',
      '[advice]',
      '  detachedHead = false',
    ].join('\n'),
  );
  vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');

  await execa('git', ['init', '--bare', origin]);
  await execa('git', ['clone', origin, user]);
  await commitFile(user, 'README.md', 'base\n');
  await git(user, 'push', '-u', 'origin', 'develop');
  await execa('git', ['clone', origin, other]);

  process.chdir(user);

  return {
    origin,
    user,
    other,
    cleanup: async () => {
      process.chdir(previousCwd);
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    },
  };
};
