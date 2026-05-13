import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';

export const syncBranchCommand = async (target?: string) => {
  await runSyncBranchFlow(target);
};
