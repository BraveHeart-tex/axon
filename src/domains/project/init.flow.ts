import { input, select } from '@inquirer/prompts';
import c from 'ansi-colors';
import type { z } from 'zod';

import { JIRA_PROJECT_LABELS } from '@/domains/jira/jira.constants.js';
import { CLI_MODES } from '@/domains/mode/mode.constants.js';
import type { CliMode } from '@/domains/mode/mode.types.js';
import { logger } from '@/infra/logger.js';
import { readConfig } from '@/infra/store/configStore.js';

import {
  CLASSIFIED_DEFAULTS,
  CLASSIFIED_REMOTE_PATH_SUFFIX,
  DEFAULT_BRANCH_TEMPLATE,
  FLOWS,
  GITFLOW_DEFAULTS,
  PROJECT_CONFIG_VERSION,
  PROJECT_ID_GIT_CONFIG_KEY,
} from './project.constants.js';
import { formatConfigPath } from './project.formatter.js';
import { type ProjectIdentity, resolveProjectIdentity } from './project.identity.js';
import {
  branchNameSchema,
  branchTemplateSchema,
  jiraProjectKeySchema,
  type ProjectConfig,
  type ProjectConfigInput,
} from './project.schema.js';
import {
  getProjectConfigPathForId,
  loadProjectConfig,
  saveProjectConfig,
} from './project.service.js';
import type { FlowName } from './project.types.js';

const theme = {
  prefix: c.cyan('?'),
  icon: { cursor: c.cyan('❯') },
  style: { highlight: (text: string) => c.cyan.bold(text) },
};

const isPromptExit = (error: unknown) => error instanceof Error && error.name === 'ExitPromptError';

const validateWith =
  (schema: z.ZodType) =>
  (value: string): true | string => {
    const result = schema.safeParse(value.trim());
    return result.success || `Expected ${result.error.issues[0]?.message ?? 'a valid value'}.`;
  };

const parseKeyList = (value: string) =>
  value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

const validateKeyList = (value: string): true | string => {
  const keys = parseKeyList(value);
  if (keys.length === 0) return 'Enter at least one Jira project key.';

  const invalid = keys.filter((key) => !jiraProjectKeySchema.safeParse(key).success);
  return invalid.length === 0 || `Not uppercase Jira project keys: ${invalid.join(', ')}`;
};

const suggestFlow = (remoteKey: string | null): FlowName =>
  remoteKey?.endsWith(CLASSIFIED_REMOTE_PATH_SUFFIX) ? FLOWS.CLASSIFIED : FLOWS.GITFLOW;

const requireProjectId = ({ insideRepo, id, originUrl }: ProjectIdentity): string => {
  if (!insideRepo) {
    throw new Error('Not inside a git repository. Run axon init from your project checkout.');
  }

  if (id) return id;

  if (originUrl) {
    throw new Error(
      `Can't name this project from origin (${originUrl}). ` +
        `Name it with: git config ${PROJECT_ID_GIT_CONFIG_KEY} <name>`,
    );
  }

  throw new Error(
    'This repo has no origin remote. Add one with git remote add origin <url>, ' +
      `or name the project with: git config ${PROJECT_ID_GIT_CONFIG_KEY} <name>`,
  );
};

const getFlowBlock = (existing: ProjectConfig | null, flow: FlowName) => {
  if (flow === FLOWS.CLASSIFIED) {
    return existing?.flow === FLOWS.CLASSIFIED ? existing.classified : CLASSIFIED_DEFAULTS;
  }

  return existing?.flow === FLOWS.GITFLOW ? existing.gitflow : GITFLOW_DEFAULTS;
};

const promptFlow = async (current: FlowName, suggested: FlowName) =>
  select<FlowName>({
    message: 'Workflow for this repo:',
    default: current,
    theme,
    choices: [
      {
        name: `gitflow${suggested === FLOWS.GITFLOW ? c.dim(' (suggested)') : ''}`,
        value: FLOWS.GITFLOW,
        description: 'develop → release/* → main',
      },
      {
        name: `classified${suggested === FLOWS.CLASSIFIED ? c.dim(' (suggested)') : ''}`,
        value: FLOWS.CLASSIFIED,
        description: 'one branch from main and one MR into main per ticket',
      },
    ],
  });

const promptText = async (
  message: string,
  defaultValue: string,
  validate?: (value: string) => true | string,
) => (await input({ message, default: defaultValue, validate, theme })).trim();

const promptBranches = async (existing: ProjectConfig | null, flow: FlowName) => {
  const block = getFlowBlock(existing, flow);
  const validateBranch = validateWith(branchNameSchema);

  const mainBranch = await promptText('Main branch:', block.mainBranch, validateBranch);
  const developBranch = await promptText('Develop branch:', block.developBranch, validateBranch);

  if (flow === FLOWS.CLASSIFIED) {
    const qaPassedLabel =
      'qaPassedLabel' in block ? block.qaPassedLabel : CLASSIFIED_DEFAULTS.qaPassedLabel;
    return { classified: { mainBranch, developBranch, qaPassedLabel } };
  }

  const releasePrefix = await promptText(
    'Release branch prefix:',
    'releasePrefix' in block ? block.releasePrefix : GITFLOW_DEFAULTS.releasePrefix,
    validateBranch,
  );
  return { gitflow: { mainBranch, developBranch, releasePrefix } };
};

const promptMode = async (current: CliMode) =>
  select<CliMode>({
    message: 'Mode:',
    default: current,
    theme,
    choices: [
      { name: 'jira', value: CLI_MODES.JIRA, description: 'Pick issues from Jira' },
      { name: 'default', value: CLI_MODES.DEFAULT, description: 'Type issue keys by hand' },
    ],
  });

const buildConfig = async (
  existing: ProjectConfig | null,
  suggested: FlowName,
): Promise<ProjectConfigInput> => {
  const global = readConfig();

  const flow = await promptFlow(existing?.flow ?? suggested, suggested);
  const branches = await promptBranches(existing, flow);
  const branchTemplate = await promptText(
    'Branch template:',
    existing?.branchTemplate ?? DEFAULT_BRANCH_TEMPLATE,
    validateWith(branchTemplateSchema),
  );
  const projectKeys = parseKeyList(
    await promptText(
      'Jira project keys (comma-separated):',
      (existing?.jira?.projectKeys ?? JIRA_PROJECT_LABELS).join(', '),
      validateKeyList,
    ),
  );
  const jql = await promptText(
    'Jira JQL (leave empty to use the global one):',
    existing?.jira?.jql ?? global.jiraJql,
  );
  const mode = await promptMode(existing?.mode ?? global.mode);

  const { jql: _previousJql, ...otherJira } = existing?.jira ?? {};

  return {
    version: PROJECT_CONFIG_VERSION,
    flow,
    ...branches,
    branchTemplate,
    jira: { ...otherJira, projectKeys, ...(jql ? { jql } : {}) },
    mode,
    ...(existing?.aiModel !== undefined ? { aiModel: existing.aiModel } : {}),
  } as ProjectConfigInput;
};

export const runInitFlow = async (): Promise<string | null> => {
  const identity = await resolveProjectIdentity();
  const id = requireProjectId(identity);
  const configPath = getProjectConfigPathForId(id);
  const existing = loadProjectConfig(configPath);

  console.log(`\n  ${c.bold('Remote:')}  ${identity.remoteKey ?? c.dim('(none)')}`);
  if (identity.override) {
    console.log(
      `  ${c.bold('Project:')} ${identity.override} ${c.dim(`(git config ${PROJECT_ID_GIT_CONFIG_KEY})`)}`,
    );
  }
  console.log(
    `  ${c.bold('Config:')}  ${formatConfigPath(configPath)}${existing ? c.dim(' (editing)') : ''}\n`,
  );

  let config: ProjectConfigInput;
  try {
    config = await buildConfig(existing, suggestFlow(identity.remoteKey));
  } catch (error) {
    if (isPromptExit(error)) {
      logger.info('Init cancelled. Nothing was written.');
      return null;
    }
    throw error;
  }

  saveProjectConfig(configPath, config);

  logger.success(`Saved project config to ${formatConfigPath(configPath)}`);
  console.log(
    c.dim('  You can edit this file by hand. Axon validates it on every run and never commits it.'),
  );

  return configPath;
};
