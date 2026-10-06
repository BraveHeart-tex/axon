import c from 'ansi-colors';
import ora from 'ora';

import { buildBranchName } from '@/domains/branch/branchTemplate.js';
import { resolveBranchMeta } from '@/domains/feature/flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from '@/domains/feature/flows/resolveIssueKey.flow.js';
import { updateIssueStatus } from '@/domains/feature/flows/updateIssueStatus.flow.js';
import { checkoutAndCreateBranch } from '@/domains/git/flows/checkoutAndCreateBranch.flow.js';
import {
  createBranch,
  fetchBranchFromRemote,
  remoteBranchExists,
} from '@/domains/git/git.service.js';
import { CLI_MODES } from '@/domains/mode/mode.constants.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { logger } from '@/infra/logger.js';
import { promptRebaseDivergedBranch } from '@/ui/prompts/git.prompts.js';

export const runFeatureFlow = async (context: ProjectContext) => {
  const cliMode = context.mode;

  const [{ issueKey, workType, currentStatus }, baseBranch] = await Promise.all([
    resolveIssueKey(cliMode, context.jira),
    context.flow.name === 'classified'
      ? Promise.resolve(context.flow.mainBranch)
      : remoteBranchExists(context.flow.developBranch).then((exists) =>
          exists ? context.flow.developBranch : context.flow.mainBranch,
        ),
  ]);

  const basePrefetch = fetchBranchFromRemote('origin', baseBranch).then(
    () => null,
    (error: Error) => error,
  );

  const { commitLabel, slug } = await resolveBranchMeta(issueKey, workType);
  const branch = buildBranchName(context.branchTemplate, {
    type: commitLabel,
    key: issueKey,
    slug,
  });

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
    const prefetchError = await basePrefetch;
    if (prefetchError) throw prefetchError;

    if (context.flow.name === 'classified') {
      await createBranch(branch, `origin/${baseBranch}`);
    } else {
      await checkoutAndCreateBranch(baseBranch, branch, onDiverged, { skipFetch: true });
    }
  } catch (error) {
    spinner.fail(`Git operation failed.`);
    logger.error((error as Error).message);
    return;
  }

  spinner.succeed(`Branch created successfully!`);

  console.log(`\n  ${c.green('✔')} Ready: ${c.green.bold(branch)}\n`);

  if (cliMode === CLI_MODES.JIRA) {
    await updateIssueStatus(context.jira, issueKey, currentStatus);
  }
};
