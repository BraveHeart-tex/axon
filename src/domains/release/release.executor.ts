import chalk from 'chalk';
import { execa } from 'execa';
import ora from 'ora';

import {
  abortCherryPick,
  checkoutBranch,
  cherryPick,
  createBranch,
  createMergeRequestUrl,
  getRemoteOriginUrl,
  pullBranch,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

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
  const branchSpinner = ora(`Creating branch ${chalk.cyan(branchTitle)}...`).start();
  try {
    await createBranch(branchTitle);
    branchSpinner.succeed(`Branch ${chalk.cyan(branchTitle)} created.`);
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
    const spinner = ora(`Picking ${chalk.yellow(short)}...`).start();
    try {
      await cherryPick([hash]);
      spinner.succeed(`${chalk.yellow(short)} picked.`);
    } catch {
      spinner.fail(`${chalk.yellow(short)} failed — aborting cherry-pick.`);
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
      `Cherry-pick failed on ${chalk.yellow(failed[0]!.slice(0, 7))}. Release branch left at last successful commit.`,
    );
    logger.warn(`Fix the conflict and re-run, or cherry-pick the remaining commits manually.`);
    return;
  }

  logger.info(`✓ All commits cherry-picked successfully.`);

  // --- MR URL ---
  const urlSpinner = ora('Fetching remote origin...').start();
  try {
    const remoteOriginUrl = await getRemoteOriginUrl();
    const isGitlab = remoteOriginUrl && new URL(remoteOriginUrl).hostname === 'gitlab.com';

    if (!isGitlab) {
      urlSpinner.warn('Remote is not GitLab — skipping MR URL.');
      return;
    }

    const mergeRequestUrl = createMergeRequestUrl({
      remoteOriginUrl,
      sourceBranch: branchTitle,
      targetBranch: 'main',
    });

    urlSpinner.succeed('MR URL ready.');
    console.log('');

    await execa('bash', ['-c', `echo "${mergeRequestUrl}" | pbcopy`]);
    logger.info(`MR URL copied to clipboard:`);
    console.log(chalk.cyan(`  ${mergeRequestUrl}`));
    console.log('');
  } catch (err) {
    urlSpinner.fail('Failed to generate MR URL.');
    throw err;
  }
};
