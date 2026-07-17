import { confirm, select } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora from 'ora';

import { IN_PROGRESS_STATUS } from '@/domains/jira/jira.constants.js';
import { getIssueTransitions, transitionIssue } from '@/domains/jira/jira.service.js';

export const updateIssueStatus = async (
  issueKey: string,
  currentStatus?: string,
): Promise<void> => {
  if (currentStatus && currentStatus.toLowerCase() === IN_PROGRESS_STATUS.toLowerCase()) {
    console.log(
      `\n  ${c.dim(`${issueKey} is already ${IN_PROGRESS_STATUS}. Skipping status update.`)}`,
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
    transitions = await getIssueTransitions(issueKey);
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
    await transitionIssue(issueKey, transitionId);
  } catch (error) {
    updateSpinner.warn(`Could not update Jira status: ${(error as Error).message}`);
    return;
  }

  updateSpinner.succeed(
    `${issueKey} moved: ${c.dim(currentStatus ?? 'Unknown')} ${c.dim('→')} ${c.green.bold(targetStatus)}`,
  );
};
