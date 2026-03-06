import chalk from 'chalk';

import { logger } from '@/infra/logger.js';

import { checkoutAndCreateBranch, remoteBranchExists } from '../git/git.service.js';
import { getCliModeConfig } from '../mode/mode.service.js';
import { resolveBranchMeta } from './flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from './flows/resolveIssueKey.flow.js';

export const runFeatureFlow = async () => {
  const cliMode = getCliModeConfig();

  const [issueKey, baseBranch] = await Promise.all([
    resolveIssueKey(cliMode),
    remoteBranchExists('develop').then((exists) => (exists ? 'develop' : 'main')),
  ]);

  const { commitLabel, slug } = await resolveBranchMeta(issueKey);
  const branch = slug ? `${commitLabel}/${issueKey}-${slug}` : `${commitLabel}/${issueKey}`;

  logger.info(`\nCreating branch from ${chalk.bold(baseBranch)}...`);

  try {
    await checkoutAndCreateBranch(baseBranch, branch);
    logger.info(`\n✔ Ready: ${chalk.green.bold(branch)}\n`);
  } catch (error) {
    logger.error(`Git operation failed: ${(error as Error).message}`);
  }
};
