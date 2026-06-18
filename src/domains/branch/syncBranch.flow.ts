import { confirm } from '@inquirer/prompts';
import c from 'ansi-colors';

import {
  abortRebase,
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
  pushCurrentBranchWithLease,
  rebaseOntoRemoteBranch,
  rebaseOntoRemoteBranchInteractive,
  remoteTrackingBranchExists,
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

  if (await isWorkingTreeDirty()) {
    logger.error('Working tree is dirty. Commit or stash first.');
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

  if (!(await remoteTrackingBranchExists(targetBranch))) {
    logger.warn(`origin/${targetBranch} not found — rebase may fail.`);
  }

  logger.info(`Rebasing ${c.bold(currentBranch)} onto ${c.bold(`origin/${targetBranch}`)}`);

  try {
    await rebaseOntoRemoteBranch(targetBranch);
  } catch {
    logger.warn(`Rebase onto origin/${targetBranch} failed.`);

    const useInteractive = await confirm({
      message: 'Start an interactive rebase instead, so you can resolve conflicts step by step?',
      default: false,
    });

    if (!useInteractive) {
      throw new Error(`Rebase of ${currentBranch} onto origin/${targetBranch} failed.`);
    }

    await abortRebase();
    await rebaseOntoRemoteBranchInteractive(targetBranch);
  }

  logger.info('Pushing with --force-with-lease');
  await pushCurrentBranchWithLease();

  logger.success(`Synced ${currentBranch} with origin/${targetBranch}.`);
};
