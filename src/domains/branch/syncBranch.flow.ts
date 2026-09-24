import { confirm } from '@inquirer/prompts';
import c from 'ansi-colors';

import {
  abortRebase,
  countCommitsMissingLocally,
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
  pushHeadWithLease,
  rebaseOntoRemoteBranch,
  rebaseOntoRemoteBranchInteractive,
  remoteTrackingBranchExists,
  resolveCommitSha,
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

  const remoteSha = await resolveCommitSha(`refs/remotes/origin/${currentBranch}`);

  if (remoteSha) {
    const missing = await countCommitsMissingLocally(currentBranch);

    if (missing > 0) {
      logger.error(
        `origin/${currentBranch} has ${missing} commit(s) you don't have locally. Run git pull --rebase first.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const targetBranch = target ? target.trim() : await resolveSyncTarget(currentBranch);

  if (!targetBranch) {
    logger.error('Target branch is required.');
    process.exitCode = 1;
    return;
  }

  const isReleaseBranch = currentBranch.startsWith('release/');
  const isMainOrMaster = targetBranch === 'main' || targetBranch === 'master';

  if (isReleaseBranch && !isMainOrMaster) {
    logger.warn(
      `${c.bold(currentBranch)} is a release branch. Syncing it onto ${c.bold(
        `origin/${targetBranch}`,
      )} instead of main/master is unusual.`,
    );

    const proceed = await confirm({
      message: `Sync release branch onto origin/${targetBranch}?`,
      default: false,
    });

    if (!proceed) {
      logger.info('Sync aborted.');
      return;
    }
  }

  if (!isReleaseBranch && isMainOrMaster) {
    logger.warn(
      `${c.bold(currentBranch)} is a feature branch. Rebasing it onto ${c.bold(
        `origin/${targetBranch}`,
      )} is unusual — feature branches are normally synced onto develop.`,
    );

    const proceed = await confirm({
      message: `Rebase feature branch onto origin/${targetBranch}?`,
      default: false,
    });

    if (!proceed) {
      logger.info('Sync aborted.');
      return;
    }
  }

  await performRebaseAndPush(currentBranch, targetBranch, remoteSha);
};

const performRebaseAndPush = async (
  currentBranch: string,
  targetBranch: string,
  remoteSha: string,
) => {
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
      await abortRebase();
      throw new Error(`Rebase of ${currentBranch} onto origin/${targetBranch} failed.`);
    }

    await abortRebase();
    await rebaseOntoRemoteBranchInteractive(targetBranch);
  }

  logger.info('Pushing with --force-with-lease');
  await pushHeadWithLease(currentBranch, remoteSha);

  logger.success(`Synced ${currentBranch} with origin/${targetBranch}.`);
};
