import { confirm } from '@inquirer/prompts';

import {
  checkoutBranch,
  checkoutOrCreateTrackingBranch,
  fetchOriginPrune,
  getCurrentBranchNameForWorktree,
  isWorkingTreeDirty,
} from '@/domains/git/git.service.js';
import { checkGlabAuth, listMyOpenMergeRequests } from '@/domains/mr/glab.service.js';
import { logger } from '@/infra/logger.js';

import { performRebaseAndPush } from './syncBranch.flow.js';

type SyncResult = {
  iid: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'success' | 'failed';
  message?: string;
};

export const runSyncMineFlow = async ({ yes }: { yes: boolean }) => {
  try {
    await syncMine({ yes });
  } catch (error) {
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
    logger.info('No open MRs assigned to you.');
    return;
  }

  logger.info(`Found ${mrs.length} open MR(s) assigned to you:`);
  for (const mr of mrs) {
    logger.info(`  !${mr.iid}: ${mr.sourceBranch} -> ${mr.targetBranch}`, false);
  }

  if (!yes) {
    const proceed = await confirm({ message: 'Sync all of these?', default: false });

    if (!proceed) {
      logger.info('Sync aborted.');
      return;
    }
  }

  await fetchOriginPrune();

  const results: SyncResult[] = [];

  try {
    for (const mr of mrs) {
      logger.info(`Syncing !${mr.iid}: ${mr.sourceBranch} -> ${mr.targetBranch}`);

      try {
        await checkoutOrCreateTrackingBranch(mr.sourceBranch);
        await performRebaseAndPush(mr.sourceBranch, mr.targetBranch, { interactive: false });
        results.push({ ...mr, status: 'success' });
      } catch (error) {
        logger.error((error as Error).message);
        results.push({ ...mr, status: 'failed', message: (error as Error).message });
      }
    }
  } finally {
    await checkoutBranch(originalBranch);
  }

  logger.info('Sync summary:');
  for (const result of results) {
    const line = `  !${result.iid}: ${result.sourceBranch} -> ${result.targetBranch} — ${result.status}`;

    if (result.status === 'success') {
      logger.success(line);
    } else {
      logger.error(`${line} (${result.message})`);
    }
  }

  if (results.some((result) => result.status === 'failed')) {
    process.exitCode = 1;
  }
};
