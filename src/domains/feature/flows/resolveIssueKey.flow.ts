import chalk from 'chalk';
import inquirer from 'inquirer';

import { logger } from '../../../infra/logger.js';
import { JIRA_REGEX } from '../../jira/jira.constants.js';
import { getJiraIssues } from '../../jira/jira.service.js';
import { CLI_MODES } from '../../mode/mode.constants.js';

export const resolveIssueKey = async (cliMode: string): Promise<string> => {
  if (cliMode !== CLI_MODES.JIRA) {
    return promptForIssueKey();
  }

  logger.info('Fetching JIRA issues...');
  const issues = await getJiraIssues();

  if (issues.length === 0) {
    logger.warn('No JIRA issues found. Please enter the issue key manually');
    return promptForIssueKey();
  }

  const { issueKey } = await inquirer.prompt<{ issueKey: string }>([
    {
      type: 'list',
      name: 'issueKey',
      message: 'Select an issue:',
      choices: issues.map((issue) => ({
        name: `${chalk.cyan(`[${issue.fields.status.name}]`)} ${chalk.bold(issue.key)} — ${issue.fields.summary}`,
        value: issue.key,
      })),
    },
  ]);

  return issueKey;
};

const promptForIssueKey = async (): Promise<string> => {
  const { jiraCode } = await inquirer.prompt<{ jiraCode: string }>([
    {
      type: 'input',
      name: 'jiraCode',
      message: 'Enter JIRA code (e.g., ORD-1325):',
      validate: (input: string) => (JIRA_REGEX.test(input) ? true : '❌ Invalid JIRA code'),
    },
  ]);

  return jiraCode;
};
