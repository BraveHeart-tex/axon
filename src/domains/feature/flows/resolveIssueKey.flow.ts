import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';

import { JIRA_REGEX } from '@/domains/jira/jira.constants.js';
import { getJiraIssues } from '@/domains/jira/jira.service.js';
import { CLI_MODES } from '@/domains/mode/mode.constants.js';

import { buildIssueChoices } from '../feature.formatter.js';

export const resolveIssueKey = async (cliMode: string): Promise<string> => {
  if (cliMode !== CLI_MODES.JIRA) {
    return promptForIssueKey();
  }

  const spinner = ora('Fetching Jira issues...').start();
  const issues = await getJiraIssues();

  if (issues.length === 0) {
    spinner.warn('No Jira issues found. Please enter the issue key manually.');
    return promptForIssueKey();
  }

  spinner.stop();

  const issueKey = await select({
    message: 'Select a Jira issue:',
    pageSize: 15,
    loop: false,
    choices: buildIssueChoices(issues),
    theme: {
      prefix: chalk.cyan('?'),
      icon: { cursor: chalk.cyan('❯') },
      style: {
        highlight: (text: string) => chalk.cyan(text),
      },
    },
  });

  return issueKey;
};

const promptForIssueKey = async (): Promise<string> =>
  await input({
    message: `Enter JIRA issue key ${chalk.dim('(e.g. ORD-1325)')}:`,
    validate: (val: string) => JIRA_REGEX.test(val) || '❌ Invalid JIRA code format',
  });
