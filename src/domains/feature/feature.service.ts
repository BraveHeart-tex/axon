import c from 'ansi-colors';
import ora from 'ora';

import { logger } from '@/infra/logger.js';
import { promptRebaseDivergedBranch } from '@/ui/prompts/git.prompts.js';

import { checkoutAndCreateBranch } from '../git/flows/checkoutAndCreateBranch.flow.js';
import { remoteBranchExists } from '../git/git.service.js';
import { CLI_MODES } from '../mode/mode.constants.js';
import { getCliModeConfig } from '../mode/mode.service.js';
import { resolveBranchMeta } from './flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from './flows/resolveIssueKey.flow.js';
import { updateIssueStatus } from './flows/updateIssueStatus.flow.js';

export const runFeatureFlow = async () => {
  const cliMode = getCliModeConfig();

  const [{ issueKey, workType, currentStatus }, baseBranch] = await Promise.all([
    resolveIssueKey(cliMode),
    remoteBranchExists('develop').then((exists) => (exists ? 'develop' : 'main')),
  ]);

  const { commitLabel, slug } = await resolveBranchMeta(issueKey, workType);
  const branch = slug ? `${commitLabel}/${issueKey}-${slug}` : `${commitLabel}/${issueKey}`;

  console.log('');
  const spinner = ora(`Creating branch from ${c.bold(baseBranch)}...`).start();

  // Stop the spinner around the interactive prompt so ora and inquirer don't
  // both write to the TTY at once and corrupt the output.
  const onDiverged = async (divergedBranch: string, ahead: number, behind: number) => {
    spinner.stop();
    const shouldRebase = await promptRebaseDivergedBranch(divergedBranch, ahead, behind);
    spinner.start();
    return shouldRebase;
  };

  try {
    await checkoutAndCreateBranch(baseBranch, branch, onDiverged);
  } catch (error) {
    spinner.fail(`Git operation failed.`);
    logger.error((error as Error).message);
    return;
  }

  spinner.succeed(`Branch created successfully!`);

  console.log(`\n  ${c.green('✔')} Ready: ${c.green.bold(branch)}\n`);

  if (cliMode === CLI_MODES.JIRA) {
    await updateIssueStatus(issueKey, currentStatus);
  }
};
