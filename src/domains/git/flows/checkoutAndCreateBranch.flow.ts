import { createBranch } from '../git.service.js';
import { updateBranchFromRemote } from './updateBranchFromRemote.flow.js';

export const checkoutAndCreateBranch = async (
  base: string,
  newBranch: string,
  onDiverged: (branch: string, ahead: number, behind: number) => Promise<boolean>,
  options: { skipFetch?: boolean } = {},
): Promise<void> => {
  await updateBranchFromRemote(base, onDiverged, options);
  await createBranch(newBranch);
};
