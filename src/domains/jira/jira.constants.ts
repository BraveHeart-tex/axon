export const JIRA_PROJECT_LABELS = ['FE', 'ORD', 'DIS', 'PE', 'PRD', 'MEM', 'MOD'] as const;

export const IN_PROGRESS_STATUS = 'In Progress';

export const JIRA_STATUS_ORDER = ['Blocked', 'In Progress', 'In Review', 'To Do', 'Done'] as const;

export const buildJiraRegex = (jira: { projectKeys: readonly string[] }) =>
  new RegExp(`\\b(${jira.projectKeys.join('|')})-[0-9]+\\b`);
export const JIRA_CLOUD_URL_REGEX =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net(?:\/.*)?$/;
