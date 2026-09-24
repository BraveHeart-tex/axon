import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import { logger } from '@/infra/logger.js';

type SyncBranchOptions = {
  mine?: boolean;
  yes?: boolean;
  concurrency?: string;
  keepWorktrees?: boolean;
};

const DEFAULT_CONCURRENCY = 4;

export const syncBranchCommand = async (target?: string, options: SyncBranchOptions = {}) => {
  if (options.mine) {
    if (target) {
      logger.error('Cannot pass a target branch together with --mine.');
      process.exitCode = 1;
      return;
    }

    if (options.concurrency !== undefined && !/^[1-9]\d*$/.test(options.concurrency)) {
      logger.error('--concurrency must be a positive integer.');
      process.exitCode = 1;
      return;
    }

    await runSyncMineFlow({
      yes: Boolean(options.yes),
      concurrency:
        options.concurrency === undefined ? DEFAULT_CONCURRENCY : Number(options.concurrency),
      keepWorktrees: Boolean(options.keepWorktrees),
    });
    return;
  }

  if (options.concurrency !== undefined || options.keepWorktrees) {
    logger.error('--concurrency and --keep-worktrees only work together with --mine.');
    process.exitCode = 1;
    return;
  }

  await runSyncBranchFlow(target);
};
