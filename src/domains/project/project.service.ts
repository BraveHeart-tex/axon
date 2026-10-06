import { AI_MODEL_ENV_KEY, DEFAULT_AI_MODEL } from '@/domains/ai/ai.constants.js';
import {
  IN_PROGRESS_STATUS,
  JIRA_PROJECT_LABELS,
  JIRA_STATUS_ORDER,
} from '@/domains/jira/jira.constants.js';
import { type AxonConfig, readConfig } from '@/infra/store/configStore.js';
import {
  getProjectConfigPath,
  readProjectConfigFile,
  writeProjectConfigFile,
} from '@/infra/store/projectStore.js';

import { DEFAULT_BRANCH_TEMPLATE, FLOWS, GITFLOW_DEFAULTS } from './project.constants.js';
import { resolveProjectIdentity, toProjectSlug } from './project.identity.js';
import {
  parseProjectConfig,
  type ProjectConfig,
  type ProjectConfigInput,
  validateProjectConfig,
} from './project.schema.js';
import type { AiModelSource, FlowSettings, ProjectContext } from './project.types.js';

export const getProjectConfigPathForId = (id: string) => {
  const slug = toProjectSlug(id);
  if (!slug) {
    throw new Error(
      `Project id "${id}" has no usable characters for a file name. ` +
        'Set a name made of letters, digits, ".", "_" or "-" with: git config axon.project <name>',
    );
  }

  return getProjectConfigPath(slug);
};

export const loadProjectConfig = (configPath: string): ProjectConfig | null => {
  const text = readProjectConfigFile(configPath);
  return text === null ? null : parseProjectConfig(configPath, text);
};

export const saveProjectConfig = (configPath: string, config: ProjectConfigInput) => {
  validateProjectConfig(configPath, config);
  writeProjectConfigFile(configPath, config);
};

export const updateProjectConfig = (configPath: string, update: Partial<ProjectConfigInput>) => {
  const text = readProjectConfigFile(configPath);
  if (text === null) {
    throw new Error(`${configPath} no longer exists. Run axon init to create it again.`);
  }

  parseProjectConfig(configPath, text);
  saveProjectConfig(configPath, { ...(JSON.parse(text) as ProjectConfigInput), ...update });
};

const toFlowSettings = (project: ProjectConfig | null): FlowSettings => {
  if (project?.flow === FLOWS.CLASSIFIED) {
    return { name: FLOWS.CLASSIFIED, ...project.classified };
  }

  return { name: FLOWS.GITFLOW, ...(project?.gitflow ?? GITFLOW_DEFAULTS) };
};

const resolveAiModelSetting = (
  project: ProjectConfig | null,
  global: AxonConfig,
  env: NodeJS.ProcessEnv,
): { aiModel: string; aiModelSource: AiModelSource } => {
  const envModel = env[AI_MODEL_ENV_KEY];
  if (envModel) return { aiModel: envModel, aiModelSource: 'env' };
  if (project?.aiModel) return { aiModel: project.aiModel, aiModelSource: 'project' };
  if (global.aiModel) return { aiModel: global.aiModel, aiModelSource: 'global' };
  return { aiModel: DEFAULT_AI_MODEL, aiModelSource: 'default' };
};

export const buildProjectContext = ({
  id,
  configPath,
  project,
  global,
  env,
}: {
  id: string | null;
  configPath: string | null;
  project: ProjectConfig | null;
  global: AxonConfig;
  env: NodeJS.ProcessEnv;
}): ProjectContext => ({
  id,
  configPath,
  source: project ? 'project' : 'global',
  flow: toFlowSettings(project),
  branchTemplate: project?.branchTemplate ?? DEFAULT_BRANCH_TEMPLATE,
  jira: {
    projectKeys: project?.jira?.projectKeys ?? [...JIRA_PROJECT_LABELS],
    inProgressStatus: project?.jira?.inProgressStatus ?? IN_PROGRESS_STATUS,
    statusOrder: project?.jira?.statusOrder ?? [...JIRA_STATUS_ORDER],
    jql: project?.jira?.jql || global.jiraJql,
    cloudUrl: project?.jira?.cloudUrl ?? global.jiraCloudUrl,
    email: project?.jira?.email ?? global.jiraEmail,
  },
  mode: project?.mode ?? global.mode,
  ...resolveAiModelSetting(project, global, env),
});

export const resolveProjectContext = async (): Promise<ProjectContext> => {
  const { id } = await resolveProjectIdentity();
  const configPath = id ? getProjectConfigPathForId(id) : null;
  const project = configPath ? loadProjectConfig(configPath) : null;

  return buildProjectContext({ id, configPath, project, global: readConfig(), env: process.env });
};

let resolvedContext: ProjectContext | undefined;

export const initProjectContext = async (): Promise<ProjectContext> => {
  resolvedContext ??= await resolveProjectContext();
  return resolvedContext;
};

export const getProjectContext = (): ProjectContext => {
  if (!resolvedContext) {
    throw new Error('Project context is not resolved yet. Call initProjectContext() first.');
  }

  return resolvedContext;
};
