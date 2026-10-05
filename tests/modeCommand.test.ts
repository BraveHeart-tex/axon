import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { modeCommand } from '@/commands/mode.js';
import { initProjectContext } from '@/domains/project/project.service.js';

import { createProjectRepo, type ProjectRepo } from './helpers/projectRepo.js';

describe('modeCommand', () => {
  let env: ProjectRepo | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await env?.cleanup();
    env = undefined;
  });

  it('reports a failed project config write and exits non-zero', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });
    const file = path.join(env.configDir, 'projects', 'gitlab.com__acme__app.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, flow: 'gitflow' }));
    await initProjectContext();
    fs.rmSync(file);

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((msg: string) => errors.push(msg));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

    await expect(modeCommand('jira')).rejects.toThrow('exit 1');

    expect(exit).toHaveBeenCalledWith(1);
    expect(errors.join('\n')).toMatch(/no longer exists\. Run axon init/);
    expect(fs.existsSync(file)).toBe(false);
  });
});
