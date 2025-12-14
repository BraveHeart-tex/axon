export const CLI_MODES = {
  JIRA: 'jira',
  DEFAULT: 'default',
} as const;

export type CliMode = (typeof CLI_MODES)[keyof typeof CLI_MODES];
