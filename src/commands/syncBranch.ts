import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { logger } from '@/infra/logger.js';

type SyncBranchOptions = {
  mine?: boolean;
  all?: boolean;
  includeQa?: boolean;
  yes?: boolean;
  concurrency?: string;
  keepWorktrees?: boolean;
};

const DEFAULT_CONCURRENCY = 4;

export const syncBranchCommand = async (
  target?: string,
  options: SyncBranchOptions = {},
  context?: ProjectContext,
) => {
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

    const mineOptions = {
      yes: Boolean(options.yes),
      concurrency:
        options.concurrency === undefined ? DEFAULT_CONCURRENCY : Number(options.concurrency),
      keepWorktrees: Boolean(options.keepWorktrees),
      ...(options.all ? { all: true } : {}),
      ...(options.includeQa ? { includeQa: true } : {}),
    };
    if (context) await runSyncMineFlow(mineOptions, context);
    else await runSyncMineFlow(mineOptions);
    return;
  }

  if (options.all || options.includeQa) {
    logger.error('--all and --include-qa only work together with --mine.');
    process.exitCode = 1;
    return;
  }

  if (options.concurrency !== undefined || options.keepWorktrees) {
    logger.error('--concurrency and --keep-worktrees only work together with --mine.');
    process.exitCode = 1;
    return;
  }

  if (context) await runSyncBranchFlow(target, context);
  else await runSyncBranchFlow(target);
};
