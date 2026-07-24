import { updateBranchFromRemote } from '@/domains/git/flows/updateBranchFromRemote.flow.js';
import { isBranchUpdateAbortedError } from '@/domains/git/git.errors.js';
import { promptRebaseDivergedBranch } from '@/ui/prompts/git.prompts.js';

import { createReleaseAbortedError } from '../release.errors.js';

export const updateBranchSafely = async (
  branch: string,
  options: { skipFetch?: boolean } = {},
): Promise<void> => {
  try {
    await updateBranchFromRemote(branch, promptRebaseDivergedBranch, options);
  } catch (err) {
    if (isBranchUpdateAbortedError(err)) {
      throw createReleaseAbortedError((err as Error).message);
    }

    throw err;
  }
};
