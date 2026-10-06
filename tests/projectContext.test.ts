import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveAiModel } from '@/domains/ai/ai.config.js';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/domains/ai/ai.constants.js';
import {
  getJiraCloudUrlOrPrompt,
  getJiraEmailOrPrompt,
  getJiraJqlOrPrompt,
} from '@/domains/jira/jira.config.js';
import {
  IN_PROGRESS_STATUS,
  JIRA_PROJECT_LABELS,
  JIRA_STATUS_ORDER,
} from '@/domains/jira/jira.constants.js';
import { setCliModeConfig } from '@/domains/mode/mode.service.js';
import { isProjectConfigError } from '@/domains/project/project.errors.js';
import { formatFlowBanner } from '@/domains/project/project.formatter.js';
import {
  buildProjectContext,
  getProjectContext,
  initProjectContext,
  resolveProjectContext,
} from '@/domains/project/project.service.js';
import { type AxonConfig, readConfig, writeConfig } from '@/infra/store/configStore.js';

import { createProjectRepo, type ProjectRepo } from './helpers/projectRepo.js';

const GLOBAL: AxonConfig = {
  mode: 'jira',
  jiraCloudUrl: 'https://acme.atlassian.net',
  jiraJql: 'global jql',
  jiraEmail: 'me@acme.com',
  aiModel: AI_MODELS.GPT_OSS_20B,
};

const EMPTY_GLOBAL: AxonConfig = {
  mode: 'default',
  jiraCloudUrl: '',
  jiraJql: '',
  jiraEmail: '',
  aiModel: '',
};

const TODAY = {
  flow: {
    name: 'gitflow',
    mainBranch: 'main',
    developBranch: 'develop',
    releasePrefix: 'release/',
  },
  branchTemplate: '{type}/{key}-{slug}',
  jira: {
    projectKeys: [...JIRA_PROJECT_LABELS],
    inProgressStatus: IN_PROGRESS_STATUS,
    statusOrder: [...JIRA_STATUS_ORDER],
  },
};

const writeProjectFile = (configDir: string, slug: string, data: unknown) => {
  const file = path.join(configDir, 'projects', `${slug}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return file;
};

describe('buildProjectContext', () => {
  it('matches today with no project config', () => {
    expect(
      buildProjectContext({ id: null, configPath: null, project: null, global: GLOBAL, env: {} }),
    ).toEqual({
      id: null,
      configPath: null,
      source: 'global',
      ...TODAY,
      jira: {
        ...TODAY.jira,
        jql: 'global jql',
        cloudUrl: 'https://acme.atlassian.net',
        email: 'me@acme.com',
      },
      mode: 'jira',
      aiModel: AI_MODELS.GPT_OSS_20B,
      aiModelSource: 'global',
    });
  });

  it('falls back to the defaults when global config is empty', () => {
    expect(
      buildProjectContext({
        id: null,
        configPath: null,
        project: null,
        global: EMPTY_GLOBAL,
        env: {},
      }),
    ).toMatchObject({
      mode: 'default',
      jira: { jql: '', cloudUrl: '', email: '' },
      aiModel: DEFAULT_AI_MODEL,
      aiModelSource: 'default',
    });
  });

  it('layers env over project over global over defaults', () => {
    const project = {
      version: 1 as const,
      flow: 'classified' as const,
      classified: { mainBranch: 'trunk', developBranch: 'staging', qaPassedLabel: 'qa::ok' },
      branchTemplate: '{key}-{slug}',
      jira: { projectKeys: ['PRD'], jql: 'project jql' },
      mode: 'default' as const,
      aiModel: AI_MODELS.QWEN3_6_27B,
    };
    const base = { id: 'acme/app', configPath: '/x/acme__app.json', project, global: GLOBAL };

    expect(buildProjectContext({ ...base, env: {} })).toEqual({
      id: 'acme/app',
      configPath: '/x/acme__app.json',
      source: 'project',
      flow: {
        name: 'classified',
        mainBranch: 'trunk',
        developBranch: 'staging',
        qaPassedLabel: 'qa::ok',
      },
      branchTemplate: '{key}-{slug}',
      jira: {
        projectKeys: ['PRD'],
        inProgressStatus: IN_PROGRESS_STATUS,
        statusOrder: [...JIRA_STATUS_ORDER],
        jql: 'project jql',
        cloudUrl: 'https://acme.atlassian.net',
        email: 'me@acme.com',
      },
      mode: 'default',
      aiModel: AI_MODELS.QWEN3_6_27B,
      aiModelSource: 'project',
    });

    expect(
      buildProjectContext({ ...base, env: { AXON_AI_MODEL: AI_MODELS.GPT_OSS_120B } }),
    ).toMatchObject({ aiModel: AI_MODELS.GPT_OSS_120B, aiModelSource: 'env' });

    expect(
      buildProjectContext({
        ...base,
        project: { version: 1, flow: 'gitflow', gitflow: TODAY.flow, aiModel: null },
        env: {},
      }),
    ).toMatchObject({
      flow: { name: 'gitflow' },
      mode: 'jira',
      jira: { jql: 'global jql', projectKeys: [...JIRA_PROJECT_LABELS] },
      aiModel: AI_MODELS.GPT_OSS_20B,
      aiModelSource: 'global',
    });
  });
});

describe('resolveProjectContext', () => {
  let env: ProjectRepo | undefined;

  afterEach(async () => {
    await env?.cleanup();
    env = undefined;
  });

  it('gives today values in a repo with no project config', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });

    const context = await resolveProjectContext();

    expect(context).toEqual({
      id: 'gitlab.com/acme/app',
      configPath: path.join(env.configDir, 'projects', 'gitlab.com__acme__app.json'),
      source: 'global',
      ...TODAY,
      jira: { ...TODAY.jira, jql: '', cloudUrl: '', email: '' },
      mode: 'default',
      aiModel: DEFAULT_AI_MODEL,
      aiModelSource: 'default',
    });
    expect(resolveAiModel(context)).toBe(DEFAULT_AI_MODEL);
    expect(formatFlowBanner(context)).toBe(
      'flow: gitflow (default) · run axon init to configure this repo',
    );
  });

  it('works outside a git repo from global config only', async () => {
    env = await createProjectRepo();
    process.chdir(env.outside);
    writeConfig({ mode: 'jira' });

    expect(await resolveProjectContext()).toMatchObject({
      id: null,
      configPath: null,
      source: 'global',
      mode: 'jira',
    });
  });

  it('loads the project file named by axon.project', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git', projectName: 'work' });
    const file = writeProjectFile(env.configDir, 'work', {
      version: 1,
      flow: 'classified',
      mode: 'jira',
    });

    const context = await resolveProjectContext();

    expect(context).toMatchObject({
      id: 'work',
      configPath: file,
      source: 'project',
      flow: { name: 'classified', mainBranch: 'main', developBranch: 'develop' },
      mode: 'jira',
    });
    expect(formatFlowBanner(context)).toBe(`flow: classified · ${file}`);
  });

  it('throws on a bad file instead of falling back', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });
    writeProjectFile(env.configDir, 'gitlab.com__acme__app', { version: 1, flow: 'trunk' });

    const error = await resolveProjectContext().catch((caught: unknown) => caught);

    expect(isProjectConfigError(error)).toBe(true);
    expect((error as Error).message).toMatch(/flow: one of "gitflow", "classified", got "trunk"/);
  });
});

describe('getProjectContext', () => {
  it('throws before the context is resolved instead of falling back to global config', () => {
    expect(() => getProjectContext()).toThrow(/not resolved/);
  });

  it('returns the context resolved by initProjectContext', async () => {
    const env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });
    try {
      writeProjectFile(env.configDir, 'gitlab.com__acme__app', { version: 1, flow: 'classified' });

      const context = await initProjectContext();

      expect(getProjectContext()).toBe(context);
      expect(context).toMatchObject({ source: 'project', flow: { name: 'classified' } });
    } finally {
      await env.cleanup();
    }
  });
});

describe('Jira getters', () => {
  it('resolves project site and account from disk before calling getters', async () => {
    const env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });
    try {
      writeConfig(GLOBAL);
      writeProjectFile(env.configDir, 'gitlab.com__acme__app', {
        version: 1,
        flow: 'classified',
        jira: { cloudUrl: 'https://project.atlassian.net', email: 'project@acme.com' },
      });
      const { jira } = await resolveProjectContext();

      expect(await getJiraCloudUrlOrPrompt(jira)).toBe('https://project.atlassian.net');
      expect(await getJiraEmailOrPrompt(jira)).toBe('project@acme.com');
      expect(await getJiraJqlOrPrompt(jira)).toBe(GLOBAL.jiraJql);
      expect(readConfig()).toEqual(GLOBAL);
    } finally {
      await env.cleanup();
    }
  });

  it('use the passed context before global config', async () => {
    const env = await createProjectRepo();
    try {
      writeConfig(GLOBAL);
      const jira = {
        ...TODAY.jira,
        jql: 'project jql',
        cloudUrl: 'https://ctx.atlassian.net',
        email: 'ctx@acme.com',
      };

      expect(await getJiraJqlOrPrompt(jira)).toBe('project jql');
      expect(await getJiraCloudUrlOrPrompt(jira)).toBe('https://ctx.atlassian.net');
      expect(await getJiraEmailOrPrompt(jira)).toBe('ctx@acme.com');
    } finally {
      await env.cleanup();
    }
  });
});

describe('setCliModeConfig', () => {
  let env: ProjectRepo | undefined;

  afterEach(async () => {
    await env?.cleanup();
    env = undefined;
  });

  it('writes to the project file when one exists', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });
    const file = writeProjectFile(env.configDir, 'gitlab.com__acme__app', {
      version: 1,
      flow: 'gitflow',
      jira: { jql: 'mine' },
    });

    const written = setCliModeConfig('jira', await resolveProjectContext());

    expect(written).toBe(file);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      version: 1,
      flow: 'gitflow',
      jira: { jql: 'mine' },
      mode: 'jira',
    });
    expect(readConfig().mode).toBe('default');
  });

  it('writes to global config without a project file', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });

    const written = setCliModeConfig('jira', await resolveProjectContext());

    expect(written).toBe(path.join(env.configDir, 'config.json'));
    expect(readConfig().mode).toBe('jira');
    expect(fs.existsSync(path.join(env.configDir, 'projects'))).toBe(false);
  });
});
