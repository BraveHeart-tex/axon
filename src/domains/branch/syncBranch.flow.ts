import c from 'ansi-colors';

import {
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
  pushCurrentBranchWithLease,
  rebaseOntoRemoteBranch,
  remoteBranchExists,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

import { resolveSyncTarget } from './resolveSyncTarget.flow.js';

export const runSyncBranchFlow = async (target?: string) => {
  try {
    await syncBranch(target);
  } catch (error) {
    logger.error((error as Error).message);
    process.exitCode = 1;
  }
};

const syncBranch = async (target?: string) => {
  const currentBranch = await getCurrentBranchNameForWorktree();

  if (!currentBranch) {
    logger.error('Not on a branch');
    process.exitCode = 1;
    return;
  }

  await fetchOriginPrune();

  const targetBranch = target ? target.trim() : await resolveSyncTarget(currentBranch);

  if (!targetBranch) {
    logger.error('Target branch is required.');
    process.exitCode = 1;
    return;
  }

  if (!(await remoteBranchExists(targetBranch))) {
    logger.warn(`origin/${targetBranch} not found — rebase may fail.`);
  }

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
