import { confirm } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora, { Ora } from 'ora';

import {
  abortRebaseStrict,
  checkoutBranch,
  checkoutDetached,
  countLocalOnlyCommits,
  fetchOriginBranches,
  getCheckedOutBranches,
  getCurrentBranchNameForWorktree,
  isAncestor,
  isRebaseInProgress,
  isWorkingTreeDirty,
  listRemoteBranches,
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

import { findSyncGuardrail } from './syncGuardrail.js';

type SyncStatus = 'synced' | 'up-to-date' | 'skipped' | 'failed' | 'interrupted' | 'not run';

const STATUS_ORDER: SyncStatus[] = [
  'synced',
  'up-to-date',
  'skipped',
  'failed',
  'interrupted',
  'not run',
];

type SyncResult = MyMergeRequest & {
  status: SyncStatus;
  reason?: string;
  hint?: string;
};

type Note = { level: 'info' | 'warn'; message: string };

type MergeRequestOutcome = {
  result: SyncResult;
  output?: string;
  note?: Note;
  abortError?: Error;
};

type RunOutcome = {
  fetchError?: Error;
  abortError?: Error;
  restoreError?: Error;
};

type Progress = { spinner?: Ora };

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
    logger.info('No open MRs authored by or assigned to you.');
    return;
  }

  const results: SyncResult[] = [];
  const candidates: MyMergeRequest[] = [];

  for (const mr of mrs) {
    const skipped = checkEligibility(mr);

    if (skipped) {
      results.push(skipped);
    } else {
      candidates.push(mr);
    }
  }

  logger.info(`Found ${mrs.length} open MR(s) authored by or assigned to you:`);
  for (const mr of mrs) {
    const skipped = results.find((result) => result.iid === mr.iid);
    logger.info(
      `  !${mr.iid}: ${mr.sourceBranch} -> ${mr.targetBranch}${
        skipped ? ` - skipped (${skipped.reason})` : ''
      }`,
      false,
    );
  }

  if (candidates.length === 0) {
    setExitCode(printSummary(mrs, results));
    return;
  }

  if (!yes) {
    const proceed = await confirm({
      message: `Sync ${candidates.length} MR(s)?`,
      default: false,
    });

    if (!proceed) {
      logger.info('Sync aborted.');
      return;
    }
  }

  const progress: Progress = {};
  let run: Promise<RunOutcome> = Promise.resolve({});

  const { signal, unregister } = registerCancellation(async () => {
    await run.catch(() => undefined);
    progress.spinner?.stop();
    await cleanUpAfterInterrupt(originalBranch, mrs, results);
  });

  let outcome: RunOutcome;

  try {
    run = syncAll(candidates, results, originalBranch, signal, progress);
    outcome = await run;
  } catch (error) {
    if (signal.aborted) return;
    unregister();
    throw error;
  }

  if (signal.aborted) return;
  unregister();

  if (outcome.fetchError) {
    printSummary(mrs, results, 'fetch failed');
    logger.error(outcome.fetchError.message);
    if (needsCredentials(outcome.fetchError.message)) logger.error(CREDENTIALS_HINT);
    process.exitCode = 1;
    return;
  }

  const rows = printSummary(
    mrs,
    results,
    outcome.abortError ? 'stopped after a failed rebase abort' : undefined,
  );

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

  setExitCode(rows);
};

const checkEligibility = (mr: MyMergeRequest): SyncResult | undefined => {
  if (mr.sourceProjectId !== mr.targetProjectId) {
    return { ...mr, status: 'skipped', reason: 'fork' };
  }

  if (mr.draft) return { ...mr, status: 'skipped', reason: 'draft' };

  if (findSyncGuardrail(mr.sourceBranch, mr.targetBranch)) {
    return {
      ...mr,
      status: 'skipped',
      reason: 'guardrail',
      hint: `Unusual target for this branch. Run \`git checkout ${mr.sourceBranch} && axon sb ${mr.targetBranch}\` to sync it after confirming.`,
    };
  }

  return undefined;
};

const syncAll = async (
  mrs: MyMergeRequest[],
  results: SyncResult[],
  originalBranch: string,
  signal: AbortSignal,
  progress: Progress,
): Promise<RunOutcome> => {
  const branches = [...new Set(mrs.flatMap((mr) => [mr.sourceBranch, mr.targetBranch]))];
  let remoteBranches: Set<string>;

  progress.spinner = startSpinner(`Fetching ${branches.length} branch(es) from origin`);

  try {
    // Fetch only branches that exist: one missing ref makes the whole fetch fail.
    remoteBranches = await listRemoteBranches(branches, { cancelSignal: signal });
    const existing = branches.filter((branch) => remoteBranches.has(branch));

    if (existing.length > 0) await fetchOriginBranches(existing, { cancelSignal: signal });

    progress.spinner.stop();
  } catch (error) {
    if (signal.aborted) return {};

    progress.spinner.fail('Fetching from origin failed.');
    return { fetchError: error as Error };
  }

  for (const [index, mr] of mrs.entries()) {
    if (signal.aborted) return {};

    const label = `[${index + 1}/${mrs.length}] !${mr.iid} ${mr.sourceBranch} -> ${mr.targetBranch}`;
    progress.spinner = startSpinner(label);

    const outcome = await syncMergeRequest(mr, remoteBranches, signal);
    results.push(outcome.result);
    reportOutcome(progress.spinner, label, outcome);

    if (outcome.abortError) return { abortError: outcome.abortError };
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
  remoteBranches: Set<string>,
  signal: AbortSignal,
): Promise<MergeRequestOutcome> => {
  const { sourceBranch, targetBranch } = mr;
  const outcome = (
    status: SyncStatus,
    reason?: string,
    { hint, ...rest }: Omit<MergeRequestOutcome, 'result'> & { hint?: string } = {},
  ): MergeRequestOutcome => ({ result: { ...mr, status, reason, hint }, ...rest });
  const interrupted = () => outcome('interrupted', 'Ctrl+C');
  const gitOptions = { cancelSignal: signal, captureOutput: true };

  const missing = [sourceBranch, targetBranch].find((branch) => !remoteBranches.has(branch));
  if (missing) return outcome('failed', `origin/${missing} not found`);

  try {
    if (
      await isAncestor(
        `refs/remotes/origin/${targetBranch}`,
        `refs/remotes/origin/${sourceBranch}`,
        gitOptions,
      )
    ) {
      return outcome('up-to-date');
    }

    await checkoutDetached(`origin/${sourceBranch}`, gitOptions);

    const originSha = await resolveCommitSha(`refs/remotes/origin/${sourceBranch}`);
    const localSha = await resolveCommitSha(`refs/heads/${sourceBranch}`);

    if (localSha && (await countLocalOnlyCommits(originSha, localSha)) > 0) {
      return outcome('skipped', 'local-only commits', {
        hint: `Push or drop the local-only commits on ${sourceBranch}, then rerun.`,
      });
    }

    try {
      await rebaseOntoRemoteBranch(targetBranch, gitOptions);
    } catch (rebaseError) {
      if (signal.aborted) return interrupted();

      const output = commandOutput(rebaseError);

      if (!(await isRebaseInProgress())) {
        return outcome('failed', `rebase onto origin/${targetBranch} failed`, { output });
      }

      const conflict = {
        output,
        hint: `Run \`git checkout ${sourceBranch} && axon sb ${targetBranch}\` to resolve it.`,
      };

      try {
        await abortRebaseStrict();
      } catch (abortError) {
        return outcome('failed', 'conflict', { ...conflict, abortError: abortError as Error });
      }

      return signal.aborted ? interrupted() : outcome('failed', 'conflict', conflict);
    }

    try {
      await pushHeadWithLease(sourceBranch, originSha, gitOptions);
    } catch (pushError) {
      if (signal.aborted) return interrupted();

      const output = commandOutput(pushError);

      return outcome('failed', 'push failed', {
        output,
        hint: needsCredentials(output) ? CREDENTIALS_HINT : undefined,
      });
    }

    return outcome('synced', undefined, { note: await updateLocalBranch(sourceBranch, localSha) });
  } catch (error) {
    if (signal.aborted) return interrupted();

    const [headline = ''] = (error as Error).message.split('\n');
    return outcome('failed', headline, { output: commandOutput(error) });
  }
};

const CREDENTIALS_HINT =
  'git needs a credential prompt to reach origin. Set up a credential helper or SSH agent, then rerun.';

const needsCredentials = (output: string) => output.includes('terminal prompts disabled');

// execa puts the command on the first line of the message, then the captured stderr/stdout.
const commandOutput = (error: unknown) =>
  (error as Error).message.split('\n').slice(1).join('\n').trim();

const updateLocalBranch = async (branch: string, oldSha: string): Promise<Note | undefined> => {
  if (!oldSha) return undefined;

  try {
    if ((await getCheckedOutBranches()).has(branch)) {
      return {
        level: 'info',
        message: `${branch} is checked out in another worktree. Run \`git reset --keep origin/${branch}\` there to update it.`,
      };
    }

    await updateLocalBranchRef(branch, await resolveCommitSha('HEAD'), oldSha);
    return undefined;
  } catch (error) {
    return {
      level: 'warn',
      message: `origin/${branch} is synced, but local ${branch} was not updated: ${(error as Error).message}. Check it for local work before resetting it to origin/${branch}.`,
    };
  }
};

const startSpinner = (text: string) => ora({ text, discardStdin: false }).start();

const reportOutcome = (spinner: Ora, label: string, outcome: MergeRequestOutcome) => {
  const { status, reason } = outcome.result;
  const text = `${label} — ${status}${reason ? ` (${reason})` : ''}`;

  if (status === 'synced') {
    spinner.succeed(text);
  } else if (status === 'up-to-date') {
    spinner.info(text);
  } else if (status === 'skipped') {
    spinner.warn(text);
  } else {
    spinner.fail(text);
  }

  if (outcome.output && status === 'failed') {
    console.error(c.dim(outcome.output.replace(/^/gm, '    ')));
  }

  if (outcome.note) logger[outcome.note.level](outcome.note.message);
};

const cleanUpAfterInterrupt = async (
  originalBranch: string,
  mrs: MyMergeRequest[],
  results: SyncResult[],
) => {
  process.exitCode = 130;

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

const setExitCode = (rows: SyncResult[]) => {
  if (rows.some((row) => row.status === 'interrupted')) {
    process.exitCode = 130;
  } else if (rows.some((row) => row.status === 'failed' || row.status === 'not run')) {
    process.exitCode = 1;
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
  for (const status of STATUS_ORDER) {
    for (const row of rows.filter((candidate) => candidate.status === status)) {
      const line = `  !${row.iid}: ${row.sourceBranch} -> ${row.targetBranch} — ${row.status}${
        row.reason ? ` (${row.reason})` : ''
      }`;

      if (row.status === 'synced' || row.status === 'up-to-date') {
        logger.success(line);
      } else if (row.status === 'skipped') {
        logger.warn(line);
      } else {
        logger.error(line);
      }

      if (row.hint) logger.info(`    ${row.hint}`, false);
    }
  }

  return rows;
};
