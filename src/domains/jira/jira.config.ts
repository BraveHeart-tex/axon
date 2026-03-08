import { ConfigManager } from '@/infra/config/configManager.js';
import { promptConfigValue, promptSecretValue } from '@/ui/prompts/config.prompts.js';

import { CREDENTIAL_KEYS } from '../config/config.constants.js';
import { JIRA_CLOUD_URL_REGEX } from './jira.constants.js';

export const getJiraApiKeyOrPrompt = async (): Promise<string> =>
  ConfigManager.getSecretOrPrompt(CREDENTIAL_KEYS.JIRA_API, () =>
    promptSecretValue('Enter API key for Jira:'),
  );

export const getJiraCloudUrlOrPrompt = async (): Promise<string> =>
  ConfigManager.getOrPrompt('jiraCloudUrl', () =>
    promptConfigValue(
      'Enter Jira Cloud URL:',
      (input) => JIRA_CLOUD_URL_REGEX.test(input) || 'Invalid Jira Cloud URL',
    ),
  );

export const getJiraJqlOrPrompt = async (): Promise<string> =>
  ConfigManager.getOrPrompt('jiraJql', () => promptConfigValue('Enter JQL query:'));

export const getJiraEmailOrPrompt = async (): Promise<string> =>
  ConfigManager.getOrPrompt('jiraEmail', () => promptConfigValue('Enter JIRA email:'));
