import { logger } from '../../utils/logger.js';
import {
  getJiraApiKeyOrPrompt,
  getJiraCloudUrlOrPrompt,
  getJiraEmailOrPrompt,
  getJiraJqlOrPrompt,
} from './jira.config.js';
import { JiraIssue, JiraIssuesResponse } from './jira.types.js';

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
