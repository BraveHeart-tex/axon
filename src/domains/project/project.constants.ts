export const FLOWS = {
  GITFLOW: 'gitflow',
  CLASSIFIED: 'classified',
} as const;

export const PROJECT_CONFIG_VERSION = 1;

export const PROJECT_ID_GIT_CONFIG_KEY = 'axon.project';

export const DEFAULT_BRANCH_TEMPLATE = '{type}/{key}-{slug}';

export const BRANCH_TEMPLATE_PLACEHOLDERS = ['{type}', '{key}', '{slug}'] as const;

export const GITFLOW_DEFAULTS = {
  mainBranch: 'main',
  developBranch: 'develop',
  releasePrefix: 'release/',
} as const;

export const CLASSIFIED_DEFAULTS = {
  mainBranch: 'main',
  developBranch: 'develop',
  qaPassedLabel: 'qa::passed',
} as const;

export const CLASSIFIED_REMOTE_PATH_SUFFIX = 'letgo-turkey/classifieds/frontends/pwa/classified';
