import { Separator } from '@inquirer/prompts';
import c from 'ansi-colors';

import { JIRA_STATUS_ORDER } from '@/domains/jira/jira.constants.js';
import type { JiraIssue } from '@/domains/jira/jira.types.js';
import { truncate } from '@/misc/truncate.js';

const STATUS_STYLES: Record<string, string> = {
  'In Progress': c.blue.bold('● IN PROGRESS'),
  'In Review': c.magenta.bold('● IN REVIEW  '),
  'To Do': c.gray.bold('● TO DO      '),
  Done: c.green.bold('● DONE       '),
  Blocked: c.red.bold('● BLOCKED    '),
};

const getStatusHeader = (status: string) =>
  STATUS_STYLES[status] ?? c.white.bold(`● ${status.toUpperCase().padEnd(11)}`);

const formatIssueChoice = (issue: JiraIssue) => {
  const key = c.cyan(issue.key.padEnd(10));

  const rawSummary = issue.fields.summary.trim();
  const summary = c.white(truncate(rawSummary, 65));

  return {
    name: `    ${key}  ${summary}`,
    value: issue.key,
    short: c.cyan(issue.key),
  };
};

export const buildIssueChoices = (
  issues: JiraIssue[],
  statusOrder: readonly string[] = JIRA_STATUS_ORDER,
) => {
  const groups = new Map<string, JiraIssue[]>();

  for (const issue of issues) {
    const status = issue.fields.status.name;
    const name = statusOrder.includes(status) ? status : 'Other';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(issue);
  }

  const choices = [];

  for (const status of [
    ...new Set([...statusOrder.filter((status) => status !== 'Other'), 'Other']),
  ]) {
    const group = groups.get(status);
    if (!group?.length) continue;

    choices.push(new Separator(`\n  ${getStatusHeader(status)}  ${c.dim(`(${group.length})`)}`));

    for (const issue of group) {
      choices.push(formatIssueChoice(issue));
    }
  }

  choices.push(new Separator(' '));

  return choices;
};
