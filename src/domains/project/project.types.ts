import type { CliMode } from '@/domains/mode/mode.types.js';

import { FLOWS } from './project.constants.js';

export type FlowName = (typeof FLOWS)[keyof typeof FLOWS];

interface GitflowSettings {
  name: typeof FLOWS.GITFLOW;
  mainBranch: string;
  developBranch: string;
  releasePrefix: string;
}

interface ClassifiedSettings {
  name: typeof FLOWS.CLASSIFIED;
  mainBranch: string;
  developBranch: string;
  qaPassedLabel: string;
}

export type FlowSettings = GitflowSettings | ClassifiedSettings;

export interface JiraSettings {
  projectKeys: string[];
  inProgressStatus: string;
  statusOrder: string[];
  jql: string;
  cloudUrl: string;
  email: string;
}

export type AiModelSource = 'env' | 'project' | 'global' | 'default';

export interface ProjectContext {
  id: string | null;
  configPath: string | null;
  source: 'project' | 'global';
  flow: FlowSettings;
  branchTemplate: string;
  jira: JiraSettings;
  mode: CliMode;
  aiModel: string;
  aiModelSource: AiModelSource;
}
