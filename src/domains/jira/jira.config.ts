import inquirer from 'inquirer';

import { getApiKey, setApiKey } from '@/config/apiKeyConfig.js';
import { readConfig, writeConfig } from '@/infra/store/configStrore.js';

import { CREDENTIAL_KEYS } from '../config/config.constants.js';
import { JIRA_CLOUD_URL_REGEX } from './jira.constants.js';

export const getJiraApiKeyOrPrompt = async (): Promise<string> => {
  const jiraApiKey = await getApiKey(CREDENTIAL_KEYS.JIRA_API);
  if (!jiraApiKey) {
    const { key } = await inquirer.prompt<{ key: string }>([
      {
        type: 'password',
        name: 'key',
        mask: '*',
        message: `Enter API key for Jira:`,
        validate: (input: string) => input.length > 0,
      },
    ]);

    await setApiKey(CREDENTIAL_KEYS.JIRA_API, key);

    return key;
  }

  return jiraApiKey;
};

export const getJiraCloudUrlOrPrompt = async () => {
  const url = readConfig().jiraCloudUrl;
  if (!url) {
    const { url } = await inquirer.prompt<{ url: string }>([
      {
        type: 'input',
        name: 'url',
        message: `Enter Jira Cloud URL:`,
        validate: (input: string) => JIRA_CLOUD_URL_REGEX.test(input),
      },
    ]);

    writeConfig({ jiraCloudUrl: url });

    return url;
  }

  return url;
};

export const getJiraJqlOrPrompt = async () => {
  const jql = readConfig().jiraJql;
  if (!jql) {
    const { jql } = await inquirer.prompt<{ jql: string }>([
      {
        type: 'input',
        name: 'jql',
        message: `Enter JQL query:`,
        validate: (input: string) => input.length > 0,
      },
    ]);

    writeConfig({ jiraJql: jql });

    return jql;
  }

  return jql;
};

export const getJiraEmailOrPrompt = async () => {
  const email = readConfig().jiraEmail;
  if (!email) {
    const { email } = await inquirer.prompt<{ email: string }>([
      {
        type: 'input',
        name: 'email',
        message: `Enter JIRA email:`,
        validate: (input: string) => input.length > 0,
      },
    ]);

    writeConfig({ jiraEmail: email });

    return email;
  }

  return email;
};
