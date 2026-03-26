import { Separator } from '@inquirer/prompts';
import chalk from 'chalk';

import type { JiraIssue } from '@/domains/jira/jira.types.js';
import { truncate } from '@/misc/truncate.js';

const STATUS_STYLES: Record<string, string> = {
  'In Progress': chalk.blue.bold('● IN PROGRESS'),
  'In Review': chalk.magenta.bold('● IN REVIEW  '),
  'To Do': chalk.gray.bold('● TO DO      '),
  Done: chalk.green.bold('● DONE       '),
  Blocked: chalk.red.bold('● BLOCKED    '),
};

const STATUS_ORDER = ['Blocked', 'In Progress', 'In Review', 'To Do', 'Done'];

const getStatusHeader = (status: string) =>
  STATUS_STYLES[status] ?? chalk.white.bold(`● ${status.toUpperCase().padEnd(11)}`);

const formatIssueChoice = (issue: JiraIssue) => {
  const key = chalk.cyan(issue.key.padEnd(10));

  const rawSummary = issue.fields.summary.trim();
  const summary = chalk.white(truncate(rawSummary, 65));

  return {
    name: `    ${key}  ${summary}`,
    value: issue.key,
    short: chalk.cyan(issue.key),
  };
};

export const buildIssueChoices = (issues: JiraIssue[]) => {
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

    choices.push(
      new Separator(`\n  ${getStatusHeader(status)}  ${chalk.dim(`(${group.length})`)}`),
    );

    for (const issue of group) {
      choices.push(formatIssueChoice(issue));
    }
  }

  choices.push(new Separator(' '));

  return choices;
};
