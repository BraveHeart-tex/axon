import inquirer from 'inquirer';

import { CREDENTIAL_KEYS } from '../constants/config.js';
import { JIRA_CLOUD_URL_REGEX, JiraIssue, JiraIssuesResponse } from '../constants/jira.js';
import { readConfig, writeConfig } from '../store/configStrore.js';
import { logger } from '../utils/logger.js';
import { getApiKey, setApiKey } from './apiKeyConfig.js';

export const getJiraApiKeyOrPrompt = async (): Promise<string> => {
  const jiraApiKey = await getApiKey(CREDENTIAL_KEYS.JIRA_API);
  if (!jiraApiKey) {
    const { key } = await inquirer.prompt<{ key: string }>([
      {
        type: 'password',
        name: 'key',
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

export const getJiraIssues = async (): Promise<JiraIssue[]> => {
  try {
    const apiKey = await getJiraApiKeyOrPrompt();
    const cloudUrl = await getJiraCloudUrlOrPrompt();
    const jql = await getJiraJqlOrPrompt();
    const email = await getJiraEmailOrPrompt();

    const requestUrl = new URL(`${cloudUrl}/rest/api/3/search/jql`);
    requestUrl.searchParams.set('jql', jql);
    requestUrl.searchParams.set('maxResults', '50');
    requestUrl.searchParams.set('fields', 'summary,key,status');

    const response = await fetch(requestUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Jira issues: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JiraIssuesResponse;

    return data.issues;
  } catch (error) {
    logger.error(`Failed to fetch Jira issues: ${error}`);
    return [];
  }
};
