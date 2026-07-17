import { logger } from '@/infra/logger.js';

import {
  getJiraApiKeyOrPrompt,
  getJiraCloudUrlOrPrompt,
  getJiraEmailOrPrompt,
  getJiraJqlOrPrompt,
} from './jira.config.js';
import {
  JiraIssue,
  JiraIssuesResponse,
  JiraTransition,
  JiraTransitionsResponse,
} from './jira.types.js';

interface JiraRequestContext {
  cloudUrl: string;
  authHeader: string;
}

const getJiraRequestContext = async (): Promise<JiraRequestContext> => {
  const apiKey = await getJiraApiKeyOrPrompt();
  const cloudUrl = await getJiraCloudUrlOrPrompt();
  const email = await getJiraEmailOrPrompt();

  return {
    cloudUrl,
    authHeader: `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`,
  };
};

export const getJiraIssues = async (): Promise<JiraIssue[]> => {
  try {
    const { cloudUrl, authHeader } = await getJiraRequestContext();
    const jql = await getJiraJqlOrPrompt();

    const requestUrl = new URL(`${cloudUrl}/rest/api/3/search/jql`);
    requestUrl.searchParams.set('jql', jql);
    requestUrl.searchParams.set('maxResults', '50');
    requestUrl.searchParams.set('fields', 'summary,key,status,issuetype');

    const response = await fetch(requestUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: authHeader,
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

export const getIssueTransitions = async (issueKey: string): Promise<JiraTransition[]> => {
  const { cloudUrl, authHeader } = await getJiraRequestContext();

  const requestUrl = new URL(`${cloudUrl}/rest/api/3/issue/${issueKey}/transitions`);

  const response = await fetch(requestUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transitions: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as JiraTransitionsResponse;

  return data.transitions;
};

export const transitionIssue = async (issueKey: string, transitionId: string): Promise<void> => {
  const { cloudUrl, authHeader } = await getJiraRequestContext();

  const requestUrl = new URL(`${cloudUrl}/rest/api/3/issue/${issueKey}/transitions`);

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update status: ${response.status} ${response.statusText}`);
  }
};
