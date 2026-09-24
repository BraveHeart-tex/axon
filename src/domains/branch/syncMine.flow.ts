import { confirm } from '@inquirer/prompts';

import {
  abortRebaseStrict,
  checkoutBranch,
  checkoutDetached,
  countLocalOnlyCommits,
  fetchOriginPrune,
  getCheckedOutBranches,
  getCurrentBranchNameForWorktree,
  isRebaseInProgress,
  isWorkingTreeDirty,
  pushHeadWithLease,
  rebaseOntoRemoteBranch,
  resolveCommitSha,
  updateLocalBranchRef,
} from '@/domains/git/git.service.js';
import {
  checkGlabAuth,
  listMyOpenMergeRequests,
  MyMergeRequest,
} from '@/domains/mr/glab.service.js';
import { registerCancellation } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

type SyncStatus = 'synced' | 'skipped' | 'failed' | 'interrupted' | 'not run';

type SyncResult = MyMergeRequest & {
  status: SyncStatus;
  reason?: string;
};

type MergeRequestOutcome = {
  result: SyncResult;
  abortError?: Error;
};

type RunOutcome = {
  abortError?: Error;
  restoreError?: Error;
};

export const runSyncMineFlow = async ({ yes }: { yes: boolean }) => {
  try {
    await syncMine({ yes });
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      logger.info('Sync aborted.');
      return;
    }

    logger.error((error as Error).message);
    process.exitCode = 1;
  }
};

const syncMine = async ({ yes }: { yes: boolean }) => {
  if (!(await checkGlabAuth())) {
    logger.error('glab is not installed or not authenticated. Run `glab auth login` first.');
    process.exitCode = 1;
    return;
  }

  if (await isWorkingTreeDirty()) {
    logger.error('Working tree is dirty. Commit or stash first.');
    process.exitCode = 1;
    return;
  }

  const originalBranch = await getCurrentBranchNameForWorktree();

  if (!originalBranch) {
    logger.error('Not on a branch');
    process.exitCode = 1;
    return;
  }

  const mrs = await listMyOpenMergeRequests();

  if (mrs.length === 0) {
    logger.info('No open MRs assigned to you.');
    return;
  }

  logger.info(`Found ${mrs.length} open MR(s) assigned to you:`);
  for (const mr of mrs) {
    logger.info(`  !${mr.iid}: ${mr.sourceBranch} -> ${mr.targetBranch}`, false);
  }

  if (!yes) {
    const proceed = await confirm({ message: 'Sync all of these?', default: false });

    if (!proceed) {
      logger.info('Sync aborted.');
      return;
    }
  }

  const results: SyncResult[] = [];
  let run: Promise<RunOutcome> = Promise.resolve({});

  const { signal, unregister } = registerCancellation(async () => {
    await run.catch(() => undefined);
    await cleanUpAfterInterrupt(originalBranch, mrs, results);
  });

  let outcome: RunOutcome;

  try {
    run = syncAll(mrs, results, originalBranch, signal);
    outcome = await run;
  } catch (error) {
    if (signal.aborted) return;
    unregister();
    throw error;
  }

  if (signal.aborted) return;
  unregister();

  const rows = printSummary(mrs, results);

  if (outcome.abortError) {
    logger.error(outcome.abortError.message);
    logger.error(
      `The repo is still mid-rebase. Run \`git rebase --abort && git checkout ${originalBranch}\` to recover.`,
    );
    process.exitCode = 1;
    return;
  }

  if (outcome.restoreError) {
    logger.error(outcome.restoreError.message);
    logger.error(`Run \`git checkout ${originalBranch}\` to return to your branch.`);
    process.exitCode = 1;
    return;
  }

  if (rows.some((row) => row.status === 'failed' || row.status === 'not run')) {
    process.exitCode = 1;
  }
};

const syncAll = async (
  mrs: MyMergeRequest[],
  results: SyncResult[],
  originalBranch: string,
  signal: AbortSignal,
): Promise<RunOutcome> => {
  await fetchOriginPrune({ cancelSignal: signal });

  for (const mr of mrs) {
    if (signal.aborted) return {};

    logger.info(`Syncing !${mr.iid}: ${mr.sourceBranch} -> ${mr.targetBranch}`);

    const { result, abortError } = await syncMergeRequest(mr, signal);
    results.push(result);

    if (abortError) return { abortError };
  }

  if (signal.aborted) return {};

  try {
    await checkoutBranch(originalBranch);
  } catch (error) {
    return { restoreError: error as Error };
  }

  return {};
};

const syncMergeRequest = async (
  mr: MyMergeRequest,
  signal: AbortSignal,
): Promise<MergeRequestOutcome> => {
  const { sourceBranch, targetBranch } = mr;
  const outcome = (status: SyncStatus, reason?: string): MergeRequestOutcome => ({
    result: { ...mr, status, reason },
  });

  try {
    await checkoutDetached(`origin/${sourceBranch}`, { cancelSignal: signal });

    const originSha = await resolveCommitSha(`refs/remotes/origin/${sourceBranch}`);
    const localSha = await resolveCommitSha(`refs/heads/${sourceBranch}`);

    if (localSha && (await countLocalOnlyCommits(originSha, localSha)) > 0) {
      logger.warn(`${sourceBranch} has local-only commits. Push or drop them, then rerun.`);
      return outcome('skipped', 'local-only commits');
    }

    try {
      await rebaseOntoRemoteBranch(targetBranch, { cancelSignal: signal });
    } catch {
      if (signal.aborted) return outcome('interrupted');

      if (!(await isRebaseInProgress())) {
        return outcome('failed', `rebase onto origin/${targetBranch} failed`);
      }

      try {
        await abortRebaseStrict();
      } catch (abortError) {
        return { ...outcome('failed', 'conflict'), abortError: abortError as Error };
      }

      return signal.aborted ? outcome('interrupted') : outcome('failed', 'conflict');
    }

    await pushHeadWithLease(sourceBranch, originSha, { cancelSignal: signal });
    await updateLocalBranch(sourceBranch, localSha);

    return outcome('synced');
  } catch (error) {
    if (signal.aborted) return outcome('interrupted');

    return outcome('failed', (error as Error).message);
  }
};

const updateLocalBranch = async (branch: string, oldSha: string) => {
  if (!oldSha) return;

  try {
    if ((await getCheckedOutBranches()).has(branch)) {
      logger.info(
        `${branch} is checked out in another worktree. Run \`git reset --keep origin/${branch}\` there to update it.`,
      );
      return;
    }

    await updateLocalBranchRef(branch, await resolveCommitSha('HEAD'), oldSha);
  } catch (error) {
    logger.warn(
      `origin/${branch} is synced, but local ${branch} was not updated: ${(error as Error).message}. Check it for local work before resetting it to origin/${branch}.`,
    );
  }
};

const cleanUpAfterInterrupt = async (
  originalBranch: string,
  mrs: MyMergeRequest[],
  results: SyncResult[],
) => {
  try {
    if (await isRebaseInProgress()) await abortRebaseStrict();
  } catch (error) {
    printSummary(mrs, results, 'interrupted');
    logger.error((error as Error).message);
    logger.error(
      `The repo is still mid-rebase. Run \`git rebase --abort && git checkout ${originalBranch}\` to recover.`,
    );
    return;
  }

  let restoreError: Error | undefined;

  try {
    await checkoutBranch(originalBranch);
  } catch (error) {
    restoreError = error as Error;
  }

  printSummary(mrs, results, 'interrupted');

  if (restoreError) {
    logger.error(restoreError.message);
    logger.error(`Run \`git checkout ${originalBranch}\` to return to your branch.`);
  }
};

const printSummary = (
  mrs: MyMergeRequest[],
  results: SyncResult[],
  notRunReason?: string,
): SyncResult[] => {
  const rows = mrs.map(
    (mr) =>
      results.find((result) => result.iid === mr.iid) ?? {
        ...mr,
        status: 'not run' as const,
        reason: notRunReason,
      },
  );

  logger.info('Sync summary:');
  for (const row of rows) {
    const line = `  !${row.iid}: ${row.sourceBranch} -> ${row.targetBranch} — ${row.status}${
      row.reason ? ` (${row.reason})` : ''
    }`;

    if (row.status === 'synced') {
      logger.success(line);
    } else if (row.status === 'skipped') {
      logger.warn(line);
    } else {
      logger.error(line);
    }
  }

  return rows;
};
