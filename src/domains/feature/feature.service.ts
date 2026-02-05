import { logger } from '@/infra/logger.js';

import { checkoutAndCreateBranch, remoteBranchExists } from '../git/git.service.js';
import { getCliModeConfig } from '../mode/mode.service.js';
import { resolveBranchMeta } from './flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from './flows/resolveIssueKey.flow.js';

export const runFeatureFlow = async () => {
  const cliMode = getCliModeConfig();

  const issueKey = await resolveIssueKey(cliMode);
  const { commitLabel, slug } = await resolveBranchMeta(issueKey);

  const branch = slug ? `${commitLabel}/${issueKey}-${slug}` : `${commitLabel}/${issueKey}`;

  logger.info('Resolving base branch...');

  try {
    const baseBranch = (await remoteBranchExists('develop')) ? 'develop' : 'main';

    if (baseBranch === 'main') {
      logger.info('No develop branch found, using main branch');
    } else {
      logger.info('Checking out develop and pulling latest changes...');
    }

    await checkoutAndCreateBranch(baseBranch, branch);
  } catch (error) {
    logger.error(`Git operation failed: ${(error as Error).message}`);
  }
};
