import { createBranchUpdateAbortedError } from '../git.errors.js';
import {
  abortRebase,
  checkoutBranch,
  countCommitsBetween,
  fetchBranchFromRemote,
  rebaseOntoRemoteBranch,
  remoteTrackingBranchExists,
} from '../git.service.js';

export const updateBranchFromRemote = async (
  branch: string,
  onDiverged: (branch: string, ahead: number, behind: number) => Promise<boolean>,
): Promise<void> => {
  await fetchBranchFromRemote('origin', branch);
  await checkoutBranch(branch);

  if (!(await remoteTrackingBranchExists(branch))) {
    throw new Error(`origin/${branch} not found — cannot update ${branch}.`);
  }

  const behind = await countCommitsBetween(branch, `origin/${branch}`);
  const ahead = await countCommitsBetween(`origin/${branch}`, branch);

  // Up-to-date or only ahead — nothing to pull in.
  if (behind === 0) {
    return;
  }

  // Behind only — rebase fast-forwards, no prompt needed.
  if (ahead === 0) {
    await rebaseOntoRemoteBranch(branch);
    return;
  }

  // Diverged — confirm before replaying local commits onto origin.
  const shouldRebase = await onDiverged(branch, ahead, behind);

  if (!shouldRebase) {
    throw createBranchUpdateAbortedError(
      `Update of ${branch} aborted — ${branch} has diverged from origin/${branch}.`,
    );
  }

  try {
    await rebaseOntoRemoteBranch(branch);
  } catch (err) {
    await abortRebase();
    throw createBranchUpdateAbortedError(
      `Rebase of ${branch} onto origin/${branch} failed: ${(err as Error).message}. ` +
        `Resolve it (or run sync) and re-run.`,
    );
  }
};
