import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import { logger } from '@/infra/logger.js';

type SyncBranchOptions = {
  mine?: boolean;
  yes?: boolean;
};

export const syncBranchCommand = async (target?: string, options: SyncBranchOptions = {}) => {
  if (options.mine) {
    if (target) {
      logger.error('Cannot pass a target branch together with --mine.');
      process.exitCode = 1;
      return;
    }

    await runSyncMineFlow({ yes: Boolean(options.yes) });
    return;
  }

  await runSyncBranchFlow(target);
};
