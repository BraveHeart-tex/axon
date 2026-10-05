import fs from 'node:fs';
import path from 'node:path';

import { input, select } from '@inquirer/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInitFlow } from '@/domains/project/init.flow.js';
import { writeConfig } from '@/infra/store/configStore.js';

import { createProjectRepo, type ProjectRepo } from './helpers/projectRepo.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
}));

type Prompt = { message: string; default?: string };

const mockedInput = vi.mocked(input) as unknown as ReturnType<typeof vi.fn>;
const mockedSelect = vi.mocked(select) as unknown as ReturnType<typeof vi.fn>;

const CLASSIFIED_REMOTE = 'git@gitlab.com:letgo-turkey/classifieds/frontends/pwa/classified.git';
const CLASSIFIED_FILE = 'gitlab.com__letgo-turkey__classifieds__frontends__pwa__classified.json';

const answer = (answers: Record<string, string>) => async (prompt: Prompt) =>
  Object.entries(answers).find(([prefix]) => prompt.message.startsWith(prefix))?.[1] ??
  prompt.default ??
  '';

const exitPromptError = () =>
  Object.assign(new Error('User force closed'), { name: 'ExitPromptError' });

const promptDefaults = () =>
  Object.fromEntries(
    [...mockedInput.mock.calls, ...mockedSelect.mock.calls].map(([prompt]) => [
      (prompt as Prompt).message,
      (prompt as Prompt).default,
    ]),
  );

describe('runInitFlow', () => {
  let env: ProjectRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedInput.mockImplementation(answer({}));
    mockedSelect.mockImplementation(answer({}));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await env.cleanup();
  });

  it('suggests classified for the Classified remote and writes the file', async () => {
    env = await createProjectRepo({ origin: CLASSIFIED_REMOTE });
    writeConfig({ mode: 'jira', jiraJql: 'assignee = currentUser()' });

    const written = await runInitFlow();

    const file = path.join(env.configDir, 'projects', CLASSIFIED_FILE);
    expect(written).toBe(file);
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      `${JSON.stringify(
        {
          version: 1,
          flow: 'classified',
          classified: { mainBranch: 'main', developBranch: 'develop', qaPassedLabel: 'qa::passed' },
          branchTemplate: '{type}/{key}-{slug}',
          jira: {
            projectKeys: ['FE', 'ORD', 'DIS', 'PE', 'PRD', 'MEM', 'MOD'],
            jql: 'assignee = currentUser()',
          },
          mode: 'jira',
        },
        null,
        2,
      )}\n`,
    );
    expect(file.startsWith(env.repo)).toBe(false);
    expect(fs.readdirSync(env.repo)).toEqual(['.git']);
  });

  it('suggests gitflow for other remotes', async () => {
    env = await createProjectRepo({ origin: 'https://gitlab.com/acme/app.git' });

    await runInitFlow();

    expect(promptDefaults()['Workflow for this repo:']).toBe('gitflow');
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(env.configDir, 'projects', 'gitlab.com__acme__app.json'),
          'utf-8',
        ),
      ),
    ).toMatchObject({
      flow: 'gitflow',
      gitflow: { mainBranch: 'main', developBranch: 'develop', releasePrefix: 'release/' },
      mode: 'default',
    });
  });

  it('prefills a re-run from the existing file and keeps keys it does not ask for', async () => {
    env = await createProjectRepo({ origin: CLASSIFIED_REMOTE });
    mockedInput.mockImplementation(
      answer({
        'Main branch:': 'trunk',
        'Branch template:': '{key}-{slug}',
        'Jira project keys': 'PRD, FE',
        'Jira JQL': 'project = PRD',
      }),
    );
    await runInitFlow();

    const file = path.join(env.configDir, 'projects', CLASSIFIED_FILE);
    const edited = JSON.parse(fs.readFileSync(file, 'utf-8'));
    edited.jira.inProgressStatus = 'Doing';
    edited.aiModel = 'openai/gpt-oss-20b';
    fs.writeFileSync(file, JSON.stringify(edited));

    vi.clearAllMocks();
    mockedInput.mockImplementation(answer({}));
    mockedSelect.mockImplementation(answer({ 'Mode:': 'jira' }));
    await runInitFlow();

    expect(promptDefaults()).toMatchObject({
      'Workflow for this repo:': 'classified',
      'Main branch:': 'trunk',
      'Develop branch:': 'develop',
      'Branch template:': '{key}-{slug}',
      'Jira project keys (comma-separated):': 'PRD, FE',
      'Jira JQL (leave empty to use the global one):': 'project = PRD',
      'Mode:': 'default',
    });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      version: 1,
      flow: 'classified',
      classified: { mainBranch: 'trunk', developBranch: 'develop', qaPassedLabel: 'qa::passed' },
      branchTemplate: '{key}-{slug}',
      jira: { projectKeys: ['PRD', 'FE'], inProgressStatus: 'Doing', jql: 'project = PRD' },
      mode: 'jira',
      aiModel: 'openai/gpt-oss-20b',
    });
  });

  it('writes nothing when a prompt is cancelled', async () => {
    env = await createProjectRepo({ origin: CLASSIFIED_REMOTE });
    mockedInput.mockImplementation(async (prompt: Prompt) => {
      if (prompt.message.startsWith('Branch template')) throw exitPromptError();
      return prompt.default ?? '';
    });

    expect(await runInitFlow()).toBeNull();
    expect(fs.existsSync(path.join(env.configDir, 'projects'))).toBe(false);
  });

  it('validates answers with the schema rules', async () => {
    env = await createProjectRepo({ origin: CLASSIFIED_REMOTE });

    await runInitFlow();

    const validator = (message: string) =>
      (
        mockedInput.mock.calls.find(([prompt]) =>
          (prompt as Prompt).message.startsWith(message),
        )?.[0] as {
          validate: (value: string) => true | string;
        }
      ).validate;

    expect(validator('Main branch:')('my main')).toBe('Expected a branch name without spaces.');
    expect(validator('Branch template:')('{type}/{slug}')).toMatch(/containing \{key\}/);
    expect(validator('Jira project keys')('PRD, fe')).toBe('Not uppercase Jira project keys: fe');
    expect(validator('Main branch:')('main')).toBe(true);
  });

  it('refuses a repo without origin or axon.project', async () => {
    env = await createProjectRepo();

    await expect(runInitFlow()).rejects.toThrow(/no origin remote.*git config axon\.project/);
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it('refuses outside a git repo', async () => {
    env = await createProjectRepo();
    process.chdir(env.outside);

    await expect(runInitFlow()).rejects.toThrow(/Not inside a git repository/);
  });
});
