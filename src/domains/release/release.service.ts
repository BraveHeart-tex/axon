import {
  checkoutBranch,
  cherryPickCommit,
  createBranch,
  pullBranch,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

import { resolveReleaseInput } from './flows/resolveReleaseInput.flow.js';
import { ReleaseOptions } from './release.types.js';

export const runReleaseFlow = async (options: ReleaseOptions) => {
  try {
    const { branchTitle, commits } = await resolveReleaseInput(options);

    logger.info('Checking out main and pulling latest changes...');
    await checkoutBranch('main');
    await pullBranch('main');

    logger.info(`Creating release branch: ${branchTitle}`);
    await createBranch(branchTitle);

    logger.info('🍒 Cherry-picking commits:');
    for (const commit of commits) {
      logger.info(`- ${commit}`);
      await cherryPickCommit(commit);
    }

    logger.info(`Release branch ${branchTitle} created and commits cherry-picked.`);
  } catch (err) {
    logger.error(`Git operation failed: ${(err as Error).message}`);
  }
};
