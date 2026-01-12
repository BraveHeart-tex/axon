import {
  checkoutBranch,
  cherryPickCommit,
  createBranch,
  createMergeRequestUrl,
  getRemoteOriginUrl,
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

    logger.info('Getting remote origin url...');
    const remoteOriginUrl = await getRemoteOriginUrl();

    const isGitlab = remoteOriginUrl && new URL(remoteOriginUrl).hostname === 'gitlab.com';
    if (!isGitlab) {
      logger.warn('Remote origin is not GitLab. Skipping GitLab merge request creation.');
      return;
    }

    const mergeRequestUrl = await createMergeRequestUrl({
      remoteOriginUrl: remoteOriginUrl,
      sourceBranch: branchTitle,
      targetBranch: 'main',
    });

    logger.info(`Use ${mergeRequestUrl} to create a merge request.`);
  } catch (err) {
    logger.error(`Git operation failed: ${(err as Error).message}`);
  }
};
