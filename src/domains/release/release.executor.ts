import c from 'ansi-colors';
import ora from 'ora';

import {
  abortCherryPick,
  cherryPick,
  createBranch,
  deleteLocalBranch,
  localBranchExists,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';
import { promptRecreateReleaseBranch } from '@/ui/prompts/release.prompts.js';

import { handleMrUrlGeneration } from '../mr/flows/mrUrl.flow.js';
import { updateBranchSafely } from './flows/updateBranchSafely.flow.js';
import type { ReleasePlan } from './release.types.js';

export const executeRelease = async (plan: ReleasePlan): Promise<void> => {
  const { branchTitle, commits } = plan;

  // --- Update main (may prompt to rebase — must run before any spinner) ---
  await updateBranchSafely('main');

  // --- Create release branch ---
  const branchExists = await localBranchExists(branchTitle);

  if (branchExists) {
    const shouldRecreateBranch = await promptRecreateReleaseBranch(branchTitle);

    if (!shouldRecreateBranch) {
      logger.info('Release aborted.');
      return;
    }
  }

  const branchSpinner = ora(
    `${branchExists ? 'Recreating' : 'Creating'} branch ${c.cyan(branchTitle)}...`,
  ).start();

  try {
    if (branchExists) {
      await deleteLocalBranch(branchTitle);
    }

    await createBranch(branchTitle);
    branchSpinner.succeed(
      `Branch ${c.cyan(branchTitle)} ${branchExists ? 'recreated' : 'created'}.`,
    );
  } catch (err) {
    branchSpinner.fail(`Failed to ${branchExists ? 'recreate' : 'create'} branch ${branchTitle}.`);
    throw err;
  }

  // --- Cherry-pick commits ---
  console.log('');
  logger.info('Cherry-picking commits:');
  console.log('');

  const failed: string[] = [];

  for (const hash of commits) {
    const short = hash.slice(0, 7);
    const spinner = ora(`Picking ${c.yellow(short)}...`).start();
    try {
      await cherryPick([hash]);
      spinner.succeed(`${c.yellow(short)} picked.`);
    } catch {
      spinner.fail(`${c.yellow(short)} failed — aborting cherry-pick.`);
      failed.push(hash);
      try {
        await abortCherryPick();
      } catch {
        logger.warn(
          'Could not abort cherry-pick — you may need to run `git cherry-pick --abort` manually.',
        );
      }
      break;
    }
  }

  console.log('');

  if (failed.length > 0) {
    logger.error(
      `Cherry-pick failed on ${c.yellow(failed[0]!.slice(0, 7))} . Release branch left at last successful commit.`,
    );
    logger.warn(`Fix the conflict and re-run, or cherry-pick the remaining commits manually.`);
    return;
  }

  logger.info(`✓ All commits cherry-picked successfully.`);

  await handleMrUrlGeneration({
    sourceBranch: branchTitle,
    targetBranch: 'main',
  });
};
