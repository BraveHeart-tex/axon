import {
  abortRebase,
  checkoutBranch,
  countCommitsBetween,
  fetchBranchFromRemote,
  rebaseOntoRemoteBranch,
  remoteTrackingBranchExists,
} from '@/domains/git/git.service.js';
import { promptRebaseDivergedBranch } from '@/ui/prompts/release.prompts.js';

import { createReleaseAbortedError } from '../release.errors.js';

export const updateBranchSafely = async (branch: string): Promise<void> => {
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
  const shouldRebase = await promptRebaseDivergedBranch(branch, ahead, behind);

  if (!shouldRebase) {
    throw createReleaseAbortedError('Release aborted.');
  }

  try {
    await rebaseOntoRemoteBranch(branch);
  } catch (err) {
    await abortRebase();
    throw createReleaseAbortedError(
      `Rebase of ${branch} onto origin/${branch} failed: ${(err as Error).message}. ` +
        `Resolve it (or run sync) and re-run the release.`,
    );
  }
};
