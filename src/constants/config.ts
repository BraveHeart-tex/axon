export const CREDENTIAL_KEYS = {
  AI: 'ai',
  JIRA_API: 'jira_api',
} as const;

export type CredentialKey = (typeof CREDENTIAL_KEYS)[keyof typeof CREDENTIAL_KEYS];
