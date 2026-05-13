import c from 'ansi-colors';

import {
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
  pushCurrentBranchWithLease,
  rebaseOntoRemoteBranch,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

export const runSyncBranchFlow = async (target = 'develop') => {
  try {
    await syncBranch(target);
  } catch (error) {
    logger.error((error as Error).message);
    process.exitCode = 1;
  }
};

const syncBranch = async (target = 'develop') => {
  const targetBranch = target.trim();

  if (!targetBranch) {
    logger.error('Target branch is required.');
    process.exitCode = 1;
    return;
  }

  const currentBranch = await getCurrentBranchNameForWorktree();

  if (!currentBranch) {
    logger.error('Not on a branch');
    process.exitCode = 1;
    return;
  }

  await fetchOriginPrune();

  if (await isWorkingTreeDirty()) {
    logger.error('Working tree is dirty. Commit or stash first.');
    process.exitCode = 1;
    return;
  }

  logger.info(`Rebasing ${c.bold(currentBranch)} onto ${c.bold(`origin/${targetBranch}`)}`);
  await rebaseOntoRemoteBranch(targetBranch);

  logger.info('Pushing with --force-with-lease');
  await pushCurrentBranchWithLease();

  logger.success(`Synced ${currentBranch} with origin/${targetBranch}.`);
};
