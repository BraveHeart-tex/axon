export const CREDENTIAL_KEYS = {
  AI: 'ai',
  JIRA_API: 'jira_api',
} as const;

export const CONFIG_SETTING_KEYS = {
  JIRA_CLOUD_URL: 'jiraCloudUrl',
  JIRA_JQL: 'jiraJql',
  JIRA_EMAIL: 'jiraEmail',
} as const;

export const CONFIG_SETTING_LABELS = {
  [CONFIG_SETTING_KEYS.JIRA_CLOUD_URL]: 'Jira Cloud URL',
  [CONFIG_SETTING_KEYS.JIRA_JQL]: 'Jira JQL',
  [CONFIG_SETTING_KEYS.JIRA_EMAIL]: 'Jira email',
} as const;
