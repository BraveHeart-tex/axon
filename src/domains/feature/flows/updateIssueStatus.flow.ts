import { confirm, select } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora from 'ora';

import { getIssueTransitions, transitionIssue } from '@/domains/jira/jira.service.js';
import type { JiraSettings } from '@/domains/project/project.types.js';

export const updateIssueStatus = async (
  jira: JiraSettings,
  issueKey: string,
  currentStatus?: string,
): Promise<void> => {
  if (currentStatus && currentStatus.toLowerCase() === jira.inProgressStatus.toLowerCase()) {
    console.log(
      `\n  ${c.dim(`${issueKey} is already ${jira.inProgressStatus}. Skipping status update.`)}`,
    );
    return;
  }

  const shouldUpdate = await confirm({
    message: `Update ${c.bold(issueKey)} status?`,
    default: true,
  });

  if (!shouldUpdate) return;

  const spinner = ora('Fetching available transitions...').start();

  let transitions;
  try {
    transitions = await getIssueTransitions(issueKey, jira);
  } catch (error) {
    spinner.warn(`Could not fetch transitions: ${(error as Error).message}`);
    return;
  }

  if (transitions.length === 0) {
    spinner.warn('No available transitions for this issue.');
    return;
  }

  spinner.stop();

  const transitionId = await select({
    message: 'Select the new status:',
    choices: transitions.map((transition) => ({
      name: transition.to.name,
      value: transition.id,
    })),
  });

  const selectedTransition = transitions.find((transition) => transition.id === transitionId);
  const targetStatus = selectedTransition?.to.name ?? '';

  const updateSpinner = ora(`Updating ${issueKey}...`).start();
  try {
    await transitionIssue(issueKey, transitionId, jira);
  } catch (error) {
    updateSpinner.warn(`Could not update Jira status: ${(error as Error).message}`);
    return;
  }

  updateSpinner.succeed(
    `${issueKey} moved: ${c.dim(currentStatus ?? 'Unknown')} ${c.dim('→')} ${c.green.bold(targetStatus)}`,
  );
};
