import chalk from 'chalk';
import inquirer from 'inquirer';

import { getJiraIssues } from '../config/jiraConfig.js';
import { JIRA_REGEX } from '../constants/jira.js';
import { CLI_MODES, CliMode } from '../constants/mode.js';
import { checkoutAndCreateBranch } from '../utils/git.js';
import { logger } from '../utils/logger.js';

const commitLabels = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'ci',
  'perf',
  'hotfix',
  'security',
] as const;

type CommitLabel = (typeof commitLabels)[number];

export const createFeatureBranch = async (cliMode: CliMode) => {
  let issueKey = '';

  if (cliMode === CLI_MODES.JIRA) {
    logger.info('Fetching JIRA issues...');
    const issues = await getJiraIssues();

    if (issues.length === 0) {
      logger.warn('No JIRA issues found. Please enter the issue key manually');
      const { jiraCode } = await inquirer.prompt<{ jiraCode: string }>([
        {
          type: 'input',
          name: 'jiraCode',
          message: `Enter JIRA code (e.g., ORD-1325):`,
          validate: (input: string) =>
            JIRA_REGEX.test(input)
              ? true
              : '❌ Invalid JIRA code. Must match FE|ORD|DIS|PE|PRD|MEM|MOD-[0-9]+',
        },
      ]);

      issueKey = jiraCode;
    } else {
      const { issueKey: selectedIssueKey } = await inquirer.prompt<{ issueKey: string }>([
        {
          type: 'list',
          name: 'issueKey',
          message: 'Select an issue:',
          choices: issues.map((issue) => {
            const status = chalk.cyan(`[${issue.fields.status.name}]`);
            const key = chalk.bold(issue.key);
            const summary = chalk.white(issue.fields.summary);

            return {
              name: `${status} ${key} — ${summary}`,
              value: issue.key,
            };
          }),
        },
      ]);

      issueKey = selectedIssueKey;
    }
  }

  const issueContext = issueKey ? chalk.dim(`\n  Issue: ${chalk.bold(issueKey)}`) : '';
  const { commitLabel } = await inquirer.prompt<{ commitLabel: CommitLabel }>([
    {
      type: 'list',
      name: 'commitLabel',
      message: `Select a branch type:${issueContext}`,
      choices: commitLabels,
    },
  ]);

  if (!issueKey) {
    const branchTypeContext = chalk.dim(`\n  Branch Type: ${chalk.bold(commitLabel)}`);
    const { jiraCode } = await inquirer.prompt<{ jiraCode: string }>([
      {
        type: 'input',
        name: 'jiraCode',
        message: `Enter JIRA code (e.g., ORD-1325):${branchTypeContext}`,
        validate: (input: string) =>
          JIRA_REGEX.test(input)
            ? true
            : '❌ Invalid JIRA code. Must match FE|ORD|DIS|PE|PRD|MEM|MOD-[0-9]+',
      },
    ]);

    issueKey = jiraCode;
  }

  const { shortDesc } = await inquirer.prompt([
    {
      type: 'input',
      name: 'shortDesc',
      message: 'Optional short description (e.g., add-logging):',
    },
  ]);

  const slug = shortDesc
    ? shortDesc
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';

  const branch = slug ? `${commitLabel}/${issueKey}-${slug}` : `${commitLabel}/${issueKey}`;

  logger.info('Checking out develop and pulling latest changes...');

  try {
    await checkoutAndCreateBranch('develop', branch);
  } catch (error) {
    logger.error(`Git operation failed: ${(error as Error).message}`);
  }
};
