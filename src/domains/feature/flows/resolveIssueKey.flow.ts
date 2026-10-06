import { input, select } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora from 'ora';

import { buildIssueChoices } from '@/domains/feature/feature.formatter.js';
import { buildJiraRegex } from '@/domains/jira/jira.constants.js';
import { getJiraIssues } from '@/domains/jira/jira.service.js';
import { CLI_MODES } from '@/domains/mode/mode.constants.js';
import type { JiraSettings } from '@/domains/project/project.types.js';

interface ResolvedIssue {
  issueKey: string;
  workType?: string;
  currentStatus?: string;
}

export const resolveIssueKey = async (
  cliMode: string,
  jira: JiraSettings,
): Promise<ResolvedIssue> => {
  if (cliMode !== CLI_MODES.JIRA) {
    return { issueKey: await promptForIssueKey(jira) };
  }

  const spinner = ora('Fetching Jira issues...').start();
  const issues = await getJiraIssues(jira);

  if (issues.length === 0) {
    spinner.warn('No Jira issues matched your saved JQL. Please enter the issue key manually.');
    return { issueKey: await promptForIssueKey(jira) };
  }

  spinner.stop();

  const issueKey = await select({
    message: 'Select a Jira issue:',
    pageSize: 15,
    loop: false,
    choices: buildIssueChoices(issues, jira.statusOrder),
    theme: {
      prefix: c.cyan('?'),
      icon: { cursor: c.cyan('❯') },
      style: {
        highlight: (text: string) => c.cyan.bold(text),
      },
    },
  });

  const selectedIssue = issues.find((issue) => issue.key === issueKey);

  return {
    issueKey,
    workType: selectedIssue?.fields.issuetype?.name,
    currentStatus: selectedIssue?.fields.status?.name,
  };
};

const promptForIssueKey = async (jira: JiraSettings): Promise<string> =>
  await input({
    message: `Enter JIRA issue key ${c.dim(`(e.g. ${jira.projectKeys[0]}-1325)`)}:`,
    validate: (val: string) =>
      new RegExp(`^(?:${buildJiraRegex(jira).source})$`).test(val) || '❌ Invalid JIRA code format',
  });
