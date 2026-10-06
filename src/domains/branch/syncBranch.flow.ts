import { confirm } from '@inquirer/prompts';
import c from 'ansi-colors';

import {
  checkClassifiedCommits,
  checkClassifiedMrTarget,
  checkClassifiedPush,
} from '@/domains/branch/classifiedGuards.js';
import { resolveSyncTarget } from '@/domains/branch/resolveSyncTarget.flow.js';
import { findSyncGuardrail } from '@/domains/branch/syncGuardrail.js';
import {
  abortRebase,
  autosquashOntoRemoteBranch,
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
import type { ProjectContext } from '@/domains/project/project.types.js';
import { registerCancellation } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

export const runSyncBranchFlow = async (target?: string, context?: ProjectContext) => {
  try {
    await syncBranch(target, context);
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      logger.info('Sync aborted.');
      return;
    }
    logger.error((error as Error).message);
    process.exitCode = 1;
  }
};

const syncBranch = async (target?: string, context?: ProjectContext) => {
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

  const targetBranch = target ? target.trim() : await resolveSyncTarget(currentBranch, context);

  if (!targetBranch) {
    logger.error('Target branch is required.');
    process.exitCode = 1;
    return;
  }

  const classified = context?.flow.name === 'classified';
  if (classified) {
    if (targetBranch === context.flow.developBranch) {
      throw new Error(
        `Classified MRs never sync onto ${context.flow.developBranch}. Use axon sb (onto ${context.flow.mainBranch}) or a teammate's branch.`,
      );
    }
    logger.info('Checking Classified MR and commit safety');
    await checkClassifiedMrTarget(currentBranch, context.flow);
    if (!(await checkClassifiedCommits(targetBranch, context.flow))) {
      logger.info('Sync aborted.');
      return;
    }
  }

  const guardrail = classified
    ? undefined
    : findSyncGuardrail(currentBranch, targetBranch, context?.flow);

  if (guardrail === 'release-branch-off-main') {
    logger.warn(
      `${c.bold(currentBranch)} is a release branch. Syncing it onto ${c.bold(
        `origin/${targetBranch}`,
      )} instead of ${context?.flow.mainBranch ?? 'main/master'} is unusual.`,
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

  if (guardrail === 'feature-branch-onto-main') {
    logger.warn(
      `${c.bold(currentBranch)} is a feature branch. Rebasing it onto ${c.bold(
        `origin/${targetBranch}`,
      )} is unusual - feature branches are normally synced onto ${context?.flow.developBranch ?? 'develop'}.`,
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

  await performRebaseAndPush(currentBranch, targetBranch, remoteSha, classified);
};

const performRebaseAndPush = async (
  currentBranch: string,
  targetBranch: string,
  remoteSha: string,
  classified: boolean,
) => {
  let rebase: Promise<void> | undefined;
  const cancellation = registerCancellation(async () => {
    await rebase?.catch(() => undefined);
    await abortRebase();
  });
  try {
    if (!(await remoteTrackingBranchExists(targetBranch))) {
      logger.warn(`origin/${targetBranch} not found - rebase may fail.`);
    }

    logger.info(`Rebasing ${c.bold(currentBranch)} onto ${c.bold(`origin/${targetBranch}`)}`);

    try {
      rebase = classified
        ? autosquashOntoRemoteBranch(targetBranch, { cancelSignal: cancellation.signal })
        : rebaseOntoRemoteBranch(targetBranch, { cancelSignal: cancellation.signal });
      await rebase;
    } catch (error) {
      if (cancellation.signal.aborted) throw error;
      logger.warn(`Rebase onto origin/${targetBranch} failed.`);

      let useInteractive: boolean;
      try {
        useInteractive = await confirm({
          message:
            'Start an interactive rebase instead, so you can resolve conflicts step by step?',
          default: false,
        });
      } catch (error) {
        await abortRebase();
        throw error;
      }

      if (!useInteractive) {
        await abortRebase();
        throw new Error(`Rebase of ${currentBranch} onto origin/${targetBranch} failed.`);
      }

      await abortRebase();
      rebase = rebaseOntoRemoteBranchInteractive(targetBranch, {
        cancelSignal: cancellation.signal,
      });
      await rebase;
    }

    if (classified) await checkClassifiedPush(targetBranch);

    logger.info('Pushing with --force-with-lease');
    await pushHeadWithLease(currentBranch, remoteSha, { cancelSignal: cancellation.signal });

    logger.success(`Synced ${currentBranch} with origin/${targetBranch}.`);
  } finally {
    cancellation.unregister();
  }
};
