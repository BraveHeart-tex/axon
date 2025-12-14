import { logger } from '../../infra/logger.js';
import { checkoutAndCreateBranch } from '../git/git.service.js';
import { getCliModeConfig } from '../mode/mode.service.js';
import { resolveBranchMeta } from './flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from './flows/resolveIssueKey.flow.js';

export const runFeatureFlow = async () => {
  const cliMode = getCliModeConfig();

  const issueKey = await resolveIssueKey(cliMode);
  const { commitLabel, slug } = await resolveBranchMeta(issueKey);

  const branch = slug ? `${commitLabel}/${issueKey}-${slug}` : `${commitLabel}/${issueKey}`;

  logger.info('Checking out develop and pulling latest changes...');

  try {
    await checkoutAndCreateBranch('develop', branch);
  } catch (error) {
    logger.error(`Git operation failed: ${(error as Error).message}`);
  }
};
