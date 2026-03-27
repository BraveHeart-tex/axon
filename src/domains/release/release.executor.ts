import c from 'ansi-colors';
import ora from 'ora';

import {
  abortCherryPick,
  checkoutBranch,
  cherryPick,
  createBranch,
  pullBranch,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

import { handleMrUrlGeneration } from '../mr/flows/mrUrl.flow.js';
import type { ReleasePlan } from './release.types.js';

export const executeRelease = async (plan: ReleasePlan): Promise<void> => {
  const { branchTitle, commits } = plan;

  // --- Checkout + pull main ---
  const setupSpinner = ora('Checking out main and pulling latest...').start();
  try {
    await checkoutBranch('main');
    await pullBranch('main');
    setupSpinner.succeed('main is up to date.');
  } catch (err) {
    setupSpinner.fail('Failed to checkout or pull main.');
    throw err;
  }

  // --- Create release branch ---
  const branchSpinner = ora(`Creating branch ${c.cyan(branchTitle)}...`).start();
  try {
    await createBranch(branchTitle);
    branchSpinner.succeed(`Branch ${c.cyan(branchTitle)} created.`);
  } catch (err) {
    branchSpinner.fail(`Failed to create branch ${branchTitle}.`);
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
      `Cherry-pick failed on ${c.yellow(failed[0]!.slice(0, 7))}. Release branch left at last successful commit.`,
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
