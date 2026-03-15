import chalk from 'chalk';
import inquirer from 'inquirer';

import type { JiraIssue } from '@/domains/jira/jira.types.js';
import { truncate } from '@/misc/truncate.js';

const STATUS_BADGE: Record<string, string> = {
  'In Progress': chalk.bgBlue.white(' IN PROG '),
  'In Review': chalk.bgMagenta.white(' REVIEW  '),
  'To Do': chalk.bgGray.white(' TO DO   '),
  Done: chalk.bgGreen.black(' DONE    '),
  Blocked: chalk.bgRed.white(' BLOCKED '),
};

const STATUS_ORDER = ['Blocked', 'In Progress', 'In Review', 'To Do', 'Done'];

const getStatusBadge = (status: string) =>
  STATUS_BADGE[status] ?? chalk.bgWhite.black(` ${truncate(status, 7).padEnd(7)} `);

const formatIssueChoice = (issue: JiraIssue) => {
  const key = chalk.cyan.bold(issue.key.padEnd(10));
  const summary = chalk.white(truncate(issue.fields.summary, 72));

  return {
    name: `  ${key}  ${summary}`,
    value: issue.key,
    short: chalk.cyan(issue.key),
  };
};

export const buildIssueChoices = (issues: JiraIssue[]) => {
  // Group by status
  const groups = new Map<string, JiraIssue[]>();
  for (const issue of issues) {
    const name = issue.fields.status.name;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(issue);
  }

  const choices = [];

  for (const status of STATUS_ORDER) {
    const group = groups.get(status);
    if (!group?.length) continue;

    // Separator acts as a group header
    choices.push(
      new inquirer.Separator(
        `\n  ${getStatusBadge(status)}  ${chalk.dim(`${group.length} issue${group.length > 1 ? 's' : ''}`)}`,
      ),
    );

    for (const issue of group) {
      choices.push(formatIssueChoice(issue));
    }
  }

  return choices;
};
