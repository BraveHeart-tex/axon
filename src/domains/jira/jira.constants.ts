export const JIRA_PROJECT_LABELS = ['FE', 'ORD', 'DIS', 'PE', 'PRD', 'MEM', 'MOD'] as const;

export const IN_PROGRESS_STATUS = 'In Progress';

export const JIRA_REGEX = new RegExp(`\\b(${JIRA_PROJECT_LABELS.join('|')})-[0-9]+\\b`);
export const JIRA_CLOUD_URL_REGEX =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net(?:\/.*)?$/;
