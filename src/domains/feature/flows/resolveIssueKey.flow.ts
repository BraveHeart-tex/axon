import chalk from 'chalk';
import inquirer from 'inquirer';

import { JIRA_REGEX } from '@/domains/jira/jira.constants.js';
import { getJiraIssues } from '@/domains/jira/jira.service.js';
import { CLI_MODES } from '@/domains/mode/mode.constants.js';
import { logger } from '@/infra/logger.js';

import { buildIssueChoices } from '../feature.formatter.js';

export const resolveIssueKey = async (cliMode: string): Promise<string> => {
  if (cliMode !== CLI_MODES.JIRA) {
    return promptForIssueKey();
  }

  logger.info('Fetching JIRA issues...');
  const issues = await getJiraIssues();

  if (issues.length === 0) {
    logger.warn('No JIRA issues found. Please enter the issue key manually.');
    return promptForIssueKey();
  }

  const { issueKey } = await inquirer.prompt<{ issueKey: string }>([
    {
      type: 'list',
      name: 'issueKey',
      message: 'Select a Jira issue:',
      pageSize: 12,
      choices: buildIssueChoices(issues),
    },
  ]);

  return issueKey;
};

const promptForIssueKey = async (): Promise<string> => {
  const { jiraCode } = await inquirer.prompt<{ jiraCode: string }>([
    {
      type: 'input',
      name: 'jiraCode',
      message: `Enter JIRA issue key ${chalk.dim('(e.g. ORD-1325)')}:`,
      validate: (input: string) => JIRA_REGEX.test(input) || '❌ Invalid JIRA code format',
    },
  ]);

  return jiraCode;
};
