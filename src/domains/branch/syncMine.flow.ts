import { rm } from 'node:fs/promises';
import path from 'node:path';

import { confirm } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora, { Ora } from 'ora';

import { findSyncGuardrail } from '@/domains/branch/syncGuardrail.js';
import { buildSyncGraph, findStackRoot, isStacked, SyncGraph } from '@/domains/branch/syncStack.js';
import {
  abortWorktreeRebase,
  addDetachedWorktree,
  countLocalOnlyCommits,
  createBranchAt,
  deleteBranchesQuietly,
  fetchOriginBranches,
  getCheckedOutBranches,
  getForkPoint,
  getGitCommonDir,
  getGitVersion,
  isAncestor,
  listLocalBranches,
  listRemoteBranches,
  listWorktreePaths,
  pruneWorktrees,
  pushWithLeases,
  rebaseWorktreeOnto,
  removeWorktree,
  replayOnto,
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
import { acquirePidLock, isLockHeldError, PidLock } from '@/infra/pidLock.js';

type SyncMineOptions = { yes: boolean; concurrency: number; keepWorktrees: boolean };

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
};

type Rebased = { mr: MyMergeRequest; originSha: string; localSha: string; newSha: string };

type RebaseOutcome = { rebased: Rebased } | { done: MergeRequestOutcome };

type RunContext = {
  signal: AbortSignal;
  workspace: string;
  useReplay: boolean;
  keepWorktrees: boolean;
  concurrency: number;
  labels: Map<string, string>;
  progress: Progress;
  results: SyncResult[];
  isLockHeld: () => Promise<boolean>;
};

type RunOutcome = { fetchError?: Error; lockLost?: boolean };

type RunState = {
  mrs: MyMergeRequest[];
  results: SyncResult[];
  progress: Progress;
  run: Promise<RunOutcome> | undefined;
};

const SYNC_BRANCH_PREFIX = 'axon-sync/';

const REPLAY_MIN_VERSION = { major: 2, minor: 44 };

const PUSH_RETRY_DELAY_MS = 2000;

const LOCK_LOST =
  'Another sync took over the lock during this run. Wait for it to finish, then rerun.';

const NETWORK_ERROR =
  /Could not resolve host|Connection timed out|Connection reset|unable to access|early EOF|RPC failed/;

// Every git call in --mine runs with hooks disabled.
const quietGit = { skipHooks: true };

export const runSyncMineFlow = async (options: SyncMineOptions) => {
  try {
    await syncMine(options);
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      logger.info('Sync aborted.');
      return;
    }

    logger.error((error as Error).message);
    process.exitCode = 1;
  }
};

const syncMine = async ({ yes, concurrency, keepWorktrees }: SyncMineOptions) => {
  if (!(await checkGlabAuth())) {
    logger.error('glab is not installed or not authenticated. Run `glab auth login` first.');
    process.exitCode = 1;
    return;
  }

  const version = await getGitVersion();
  const useReplay =
    version.major > REPLAY_MIN_VERSION.major ||
    (version.major === REPLAY_MIN_VERSION.major && version.minor >= REPLAY_MIN_VERSION.minor);

  const gitDir = await getGitCommonDir();
  const workspace = path.join(gitDir, 'axon-sync');
  let lock: PidLock;

  try {
    lock = await acquirePidLock(path.join(gitDir, 'axon-sync.lock'));
  } catch (error) {
    if (!isLockHeldError(error)) throw error;

    logger.error(error.message);
    process.exitCode = 1;
    return;
  }

  const state: RunState = { mrs: [], results: [], progress: createProgress(), run: undefined };

  const { signal, unregister } = registerCancellation(async () => {
    await state.run?.catch(() => undefined);
    state.progress.stop();
    process.exitCode = 130;

    // A run that took over the lock owns the workspace now.
    if (await lock.isHeld()) await cleanUpWorkspace(workspace);
    await lock.release();
    if (state.mrs.length > 0) printSummary(state.mrs, state.results, 'interrupted');
  });

  const context: RunContext = {
    signal,
    workspace,
    useReplay,
    keepWorktrees,
    concurrency,
    labels: new Map(),
    progress: state.progress,
    results: state.results,
    isLockHeld: () => lock.isHeld(),
  };

  try {
    if (!(await lock.isHeld())) {
      logger.error(LOCK_LOST);
      process.exitCode = 1;
      return;
    }

    const removed = await cleanUpWorkspace(workspace);
    if (removed > 0) logger.info(`Removed ${removed} leftover(s) from an earlier sync.`);

    await syncListedMergeRequests(yes, state, context);
  } finally {
    unregister();

    if (!signal.aborted) {
      try {
        if (await lock.isHeld()) await sweepSyncBranches();
      } finally {
        await lock.release();
      }
    }
  }
};

// Parallel deletes can lose the race for packed-refs.lock, so sweep once more, one at a time.
const sweepSyncBranches = async () => {
  try {
    const leftover = await listLocalBranches(SYNC_BRANCH_PREFIX, quietGit);
    if (leftover.length === 0) return;

    await deleteBranchesQuietly(leftover, quietGit);
    const stuck = await listLocalBranches(SYNC_BRANCH_PREFIX, quietGit);

    if (stuck.length > 0) {
      logger.warn(
        `Could not delete ${stuck.join(', ')}. Run \`git branch -D ${stuck.join(' ')}\` to remove them.`,
      );
    }
  } catch (error) {
    logger.warn(
      `Could not check for leftover ${SYNC_BRANCH_PREFIX}* branches: ${(error as Error).message}. The next sync removes them.`,
    );
  }
};

const syncListedMergeRequests = async (yes: boolean, state: RunState, context: RunContext) => {
  const { signal, results } = context;
  const mrs = await listMyOpenMergeRequests();
  state.mrs = mrs;

  if (mrs.length === 0) {
    logger.info('No open MRs authored by or assigned to you.');
    return;
  }

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

  for (const [index, mr] of candidates.entries()) {
    context.labels.set(
      mr.iid,
      `[${index + 1}/${candidates.length}] !${mr.iid} ${mr.sourceBranch} -> ${mr.targetBranch}`,
    );
  }

  let outcome: RunOutcome;

  try {
    state.run = syncAll(candidates, context);
    outcome = await state.run;
  } catch (error) {
    if (signal.aborted) return;
    context.progress.stop();
    throw error;
  }

  if (signal.aborted) return;

  if (outcome.fetchError) {
    printSummary(mrs, results, 'fetch failed');
    logger.error(outcome.fetchError.message);
    if (needsCredentials(outcome.fetchError.message)) logger.error(CREDENTIALS_HINT);
    process.exitCode = 1;
    return;
  }

  if (outcome.lockLost) {
    printSummary(mrs, results, 'lock lost');
    logger.error(LOCK_LOST);
    process.exitCode = 1;
    return;
  }

  setExitCode(printSummary(mrs, results));
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

// Removes the worktrees and axon-sync/* branches a crashed or interrupted run left behind.
const cleanUpWorkspace = async (workspace: string) => {
  const worktrees = (await listWorktreePaths(quietGit)).filter((dir) =>
    dir.startsWith(`${workspace}${path.sep}`),
  );

  for (const dir of worktrees) {
    await abortWorktreeRebase(dir, quietGit);
    await removeWorktree(dir, quietGit);
  }

  const branches = await listLocalBranches(SYNC_BRANCH_PREFIX, quietGit);
  await deleteBranchesQuietly(branches, quietGit);
  await pruneWorktrees(quietGit);
  await rm(workspace, { recursive: true, force: true });

  return worktrees.length + branches.length;
};

const syncAll = async (mrs: MyMergeRequest[], context: RunContext): Promise<RunOutcome> => {
  const { signal, progress } = context;
  const gitOptions = { cancelSignal: signal, ...quietGit };
  const branches = [...new Set(mrs.flatMap((mr) => [mr.sourceBranch, mr.targetBranch]))];
  let remoteBranches: Set<string>;

  progress.step(`Fetching ${branches.length} branch(es) from origin`);

  try {
    // Fetch only branches that exist: one missing ref makes the whole fetch fail.
    remoteBranches = await listRemoteBranches(branches, gitOptions);
    const existing = branches.filter((branch) => remoteBranches.has(branch));

    if (existing.length > 0) await fetchOriginBranches(existing, gitOptions);

    progress.stop();
  } catch (error) {
    if (signal.aborted) return {};

    progress.failStep('Fetching from origin failed.');
    return { fetchError: error as Error };
  }

  const graph = buildSyncGraph(mrs);
  const rebased = await rebaseAll(mrs, graph, remoteBranches, context);

  if (signal.aborted || rebased.length === 0) return {};
  if (!(await context.isLockHeld())) return { lockLost: true };

  await pushAll(rebased, graph, context);

  return {};
};

const rebaseAll = async (
  mrs: MyMergeRequest[],
  graph: SyncGraph,
  remoteBranches: Set<string>,
  context: RunContext,
): Promise<Rebased[]> => {
  const { signal } = context;
  const byIid = new Map(mrs.map((mr) => [mr.iid, mr]));
  const tasks = new Map<string, Promise<RebaseOutcome | undefined>>();
  const limit = createLimiter(context.concurrency);

  const finish = (outcome: RebaseOutcome | undefined) => {
    if (outcome && 'done' in outcome) recordOutcome(outcome.done, context);
    return outcome;
  };

  const schedule = (mr: MyMergeRequest): Promise<RebaseOutcome | undefined> => {
    const existing = tasks.get(mr.iid);
    if (existing) return existing;

    const parentIid = graph.parentOf.get(mr.iid);
    const parentMr = parentIid === undefined ? undefined : byIid.get(parentIid);

    const task = graph.inCycle.has(mr.iid)
      ? Promise.resolve(finish(done(mr, 'failed', 'cycle')))
      : (parentMr ? schedule(parentMr) : Promise.resolve(undefined)).then(async (parent) => {
          if (signal.aborted) return undefined;

          if (parentMr && !parent) return undefined;

          if (parent && 'done' in parent && blocksChildren(parent.done.result)) {
            return finish(done(mr, 'skipped', PARENT_FAILED));
          }

          const parentRebased = parent && 'rebased' in parent ? parent.rebased : undefined;

          return limit(async () => {
            if (signal.aborted) return undefined;
            return finish(await rebaseMergeRequest(mr, parentRebased, remoteBranches, context));
          });
        });

    tasks.set(mr.iid, task);
    return task;
  };

  const outcomes = await Promise.all(mrs.map(schedule));

  return outcomes.flatMap((outcome) => (outcome && 'rebased' in outcome ? [outcome.rebased] : []));
};

const PARENT_FAILED = 'parent failed';

// A failure blocks the whole subtree, not just the direct children.
const blocksChildren = ({ status, reason }: SyncResult) =>
  status === 'failed' ||
  status === 'interrupted' ||
  (status === 'skipped' && reason === PARENT_FAILED);

const done = (
  mr: MyMergeRequest,
  status: SyncStatus,
  reason?: string,
  { hint, ...rest }: Omit<MergeRequestOutcome, 'result'> & { hint?: string } = {},
): RebaseOutcome => ({ done: { result: { ...mr, status, reason, hint }, ...rest } });

const rebaseMergeRequest = async (
  mr: MyMergeRequest,
  parent: Rebased | undefined,
  remoteBranches: Set<string>,
  context: RunContext,
): Promise<RebaseOutcome> => {
  const { sourceBranch, targetBranch } = mr;
  const { signal, progress } = context;
  const gitOptions = { cancelSignal: signal, ...quietGit };
  const interrupted = () => done(mr, 'interrupted', 'Ctrl+C');

  const missing = [sourceBranch, targetBranch].find((branch) => !remoteBranches.has(branch));
  if (missing) return done(mr, 'failed', `origin/${missing} not found`);

  progress.start(mr.iid, labelFor(mr, context));

  try {
    const upstream = `refs/remotes/origin/${targetBranch}`;
    const base = parent?.newSha ?? upstream;

    if (await isAncestor(base, `refs/remotes/origin/${sourceBranch}`, gitOptions)) {
      return done(mr, 'up-to-date');
    }

    const originSha = await resolveCommitSha(`refs/remotes/origin/${sourceBranch}`, quietGit);
    const localSha = await resolveCommitSha(`refs/heads/${sourceBranch}`, quietGit);

    if (localSha && (await countLocalOnlyCommits(originSha, localSha, quietGit)) > 0) {
      return done(mr, 'skipped', 'local-only commits', {
        hint: `Push or drop the local-only commits on ${sourceBranch}, then rerun.`,
      });
    }

    const forkPoint = await getForkPoint(upstream, originSha, gitOptions);
    const replayed = context.useReplay
      ? await replayInBranch(mr, base, forkPoint, originSha, signal)
      : undefined;

    if (signal.aborted) return interrupted();
    if (replayed) return { rebased: { mr, originSha, localSha, newSha: replayed } };

    const fallback = await rebaseInWorktree(mr, base, forkPoint, originSha, context);

    if ('conflict' in fallback) {
      return done(mr, 'failed', 'conflict', {
        output: fallback.conflict,
        hint: `Run \`git checkout ${sourceBranch} && axon sb ${targetBranch}\` to resolve it.`,
      });
    }

    return { rebased: { mr, originSha, localSha, newSha: fallback.newSha } };
  } catch (error) {
    if (signal.aborted) return interrupted();

    const [headline = ''] = (error as Error).message.split('\n');
    return done(mr, 'failed', headline, { output: commandOutput(error) });
  }
};

const replayInBranch = async (
  mr: MyMergeRequest,
  base: string,
  forkPoint: string,
  originSha: string,
  signal: AbortSignal,
) => {
  const branch = `${SYNC_BRANCH_PREFIX}${mr.iid}`;

  await createBranchAt(branch, originSha, { cancelSignal: signal, ...quietGit });

  try {
    return await replayOnto(base, forkPoint, branch, { cancelSignal: signal, ...quietGit });
  } finally {
    await deleteBranchesQuietly([branch], quietGit);
  }
};

const rebaseInWorktree = async (
  mr: MyMergeRequest,
  base: string,
  forkPoint: string,
  originSha: string,
  { signal, workspace, keepWorktrees }: RunContext,
): Promise<{ newSha: string } | { conflict: string }> => {
  const dir = path.join(workspace, mr.iid);
  const gitOptions = { cancelSignal: signal, ...quietGit };

  await addDetachedWorktree(dir, originSha, gitOptions);

  try {
    return { newSha: await rebaseWorktreeOnto(dir, base, forkPoint, gitOptions) };
  } catch (error) {
    if (signal.aborted) throw error;

    await abortWorktreeRebase(dir, quietGit);
    return { conflict: commandOutput(error) };
  } finally {
    if (!keepWorktrees) await removeWorktree(dir, quietGit);
  }
};

type PushGroup = { atomic: boolean; items: Rebased[] };

// Independent MRs share one push; each stack goes in its own atomic push.
const pushAll = async (rebased: Rebased[], graph: SyncGraph, context: RunContext) => {
  const independent: Rebased[] = [];
  const stacks = new Map<string, Rebased[]>();

  for (const item of rebased) {
    if (!isStacked(graph, item.mr.iid)) {
      independent.push(item);
      continue;
    }

    const root = findStackRoot(graph, item.mr.iid);
    stacks.set(root, [...(stacks.get(root) ?? []), item]);
  }

  const groups: PushGroup[] = [
    ...(independent.length > 0 ? [{ atomic: false, items: independent }] : []),
    ...[...stacks.values()].map((items) => ({ atomic: true, items })),
  ];

  context.progress.step(`Pushing ${rebased.length} branch(es) to origin`);

  const outcomes = (await Promise.all(groups.map((group) => pushGroup(group, context)))).flat();

  context.progress.stop();

  if (context.signal.aborted) {
    for (const { result } of outcomes) context.results.push(result);
    return;
  }

  for (const outcome of outcomes) recordOutcome(outcome, context);
};

const pushGroup = async (
  { atomic, items }: PushGroup,
  { signal }: RunContext,
): Promise<MergeRequestOutcome[]> => {
  const updates = items.map(({ mr, newSha, originSha }) => ({
    branch: mr.sourceBranch,
    sha: newSha,
    expectedSha: originSha,
  }));
  const pushOptions = { atomic, cancelSignal: signal, ...quietGit };

  let push = await pushWithLeases(updates, pushOptions);

  if (!push.ok && push.refs.size === 0 && NETWORK_ERROR.test(push.stderr) && !signal.aborted) {
    await wait(PUSH_RETRY_DELAY_MS, signal);
    if (!signal.aborted) push = await pushWithLeases(updates, pushOptions);
  }

  const outcomes: MergeRequestOutcome[] = [];

  for (const item of items) {
    const { mr } = item;
    const result = (status: SyncStatus, reason?: string, hint?: string) => ({
      ...mr,
      status,
      reason,
      hint,
    });

    if (signal.aborted) {
      outcomes.push({ result: result('interrupted', 'rerun to verify') });
      continue;
    }

    const line = push.refs.get(mr.sourceBranch);

    if (!line) {
      outcomes.push({
        result: result(
          'failed',
          'push failed',
          needsCredentials(push.stderr) ? CREDENTIALS_HINT : undefined,
        ),
        output: push.stderr,
      });
    } else if (line.flag !== '!') {
      outcomes.push({ result: result('synced'), note: await updateLocalBranch(item) });
    } else if (line.summary.includes('(stale info)')) {
      outcomes.push({
        result: result(
          'failed',
          'remote changed',
          `origin/${mr.sourceBranch} changed during the sync. Rerun to sync the new commits.`,
        ),
      });
    } else if (line.summary.includes('(atomic push failed)')) {
      outcomes.push({ result: result('skipped', 'stack rejected') });
    } else {
      outcomes.push({ result: result('failed', 'push rejected'), output: line.summary });
    }
  }

  return outcomes;
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const createLimiter = (concurrency: number) => {
  let active = 0;
  const queue: (() => void)[] = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < concurrency) {
      active++;
    } else {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    try {
      return await task();
    } finally {
      const next = queue.shift();

      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
};

const CREDENTIALS_HINT =
  'git needs a credential prompt to reach origin. Set up a credential helper or SSH agent, then rerun.';

const needsCredentials = (output: string) => output.includes('terminal prompts disabled');

// execa puts the command on the first line of the message, then the captured stderr/stdout.
const commandOutput = (error: unknown) =>
  (error as Error).message.split('\n').slice(1).join('\n').trim();

const updateLocalBranch = async ({ mr, localSha, newSha }: Rebased): Promise<Note | undefined> => {
  const branch = mr.sourceBranch;

  if (!localSha) return undefined;

  try {
    if ((await getCheckedOutBranches(quietGit)).has(branch)) {
      return {
        level: 'info',
        message: `${branch} is checked out in a worktree. Run \`git reset --keep origin/${branch}\` there to update it.`,
      };
    }

    await updateLocalBranchRef(branch, newSha, localSha, quietGit);
    return undefined;
  } catch (error) {
    return {
      level: 'warn',
      message: `origin/${branch} is synced, but local ${branch} was not updated: ${(error as Error).message}. Check it for local work before resetting it to origin/${branch}.`,
    };
  }
};

const labelFor = (mr: MyMergeRequest, { labels }: RunContext) =>
  labels.get(mr.iid) ?? `!${mr.iid} ${mr.sourceBranch} -> ${mr.targetBranch}`;

const recordOutcome = (outcome: MergeRequestOutcome, context: RunContext) => {
  context.results.push(outcome.result);
  context.progress.finish(outcome.result.iid, labelFor(outcome.result, context), outcome);
};

type Progress = ReturnType<typeof createProgress>;

// One spinner shows the in-flight MRs; each finished MR is persisted as its own line.
const createProgress = () => {
  const running = new Map<string, string>();
  let spinner: Ora | undefined;

  const runningText = () => {
    const [first = '', ...rest] = running.values();
    return rest.length > 0 ? `${first} (+${rest.length} more)` : first;
  };

  const show = (text: string) => {
    if (spinner) {
      spinner.text = text;
    } else {
      spinner = ora({ text, discardStdin: false }).start();
    }
  };

  const resume = () => {
    if (running.size > 0) {
      spinner?.start(runningText());
    } else {
      spinner = undefined;
    }
  };

  return {
    step: (text: string) => show(text),
    failStep: (text: string) => {
      spinner?.fail(text);
      spinner = undefined;
    },
    stop: () => {
      spinner?.stop();
      spinner = undefined;
    },
    start: (iid: string, label: string) => {
      running.set(iid, label);
      show(runningText());
    },
    finish: (iid: string, label: string, outcome: MergeRequestOutcome) => {
      running.delete(iid);
      show(label);

      const { status, reason } = outcome.result;
      const text = `${label} — ${status}${reason ? ` (${reason})` : ''}`;
      const current = spinner as Ora;

      if (status === 'synced') {
        current.succeed(text);
      } else if (status === 'up-to-date') {
        current.info(text);
      } else if (status === 'skipped') {
        current.warn(text);
      } else {
        current.fail(text);
      }

      if (outcome.output && status === 'failed') {
        console.error(c.dim(outcome.output.replace(/^/gm, '    ')));
      }

      if (outcome.note) logger[outcome.note.level](outcome.note.message);

      resume();
    },
  };
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
