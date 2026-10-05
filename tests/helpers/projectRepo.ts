import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { vi } from 'vitest';

export type ProjectRepo = {
  repo: string;
  configDir: string;
  outside: string;
  cleanup: () => Promise<void>;
};

export const createProjectRepo = async ({
  origin,
  projectName,
}: { origin?: string; projectName?: string } = {}): Promise<ProjectRepo> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axon-project-'));
  const repo = path.join(root, 'repo');
  const configDir = path.join(root, 'axon');
  const outside = path.join(root, 'outside');
  const globalConfig = path.join(root, 'gitconfig');
  const previousCwd = process.cwd();

  await writeFile(globalConfig, '[user]\n  name = Axon Test\n  email = axon@example.com\n');
  vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('AXON_CONFIG_DIR', configDir);
  vi.stubEnv('AXON_AI_MODEL', '');

  await execa('git', ['init', '-q', repo]);
  await execa('mkdir', ['-p', outside]);
  if (origin) await execa('git', ['remote', 'add', 'origin', origin], { cwd: repo });
  if (projectName) await execa('git', ['config', 'axon.project', projectName], { cwd: repo });

  process.chdir(repo);

  return {
    repo,
    configDir,
    outside,
    cleanup: async () => {
      process.chdir(previousCwd);
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    },
  };
};
