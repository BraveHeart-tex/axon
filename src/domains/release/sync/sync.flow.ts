import { checkbox, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';

import {
  checkoutBranch,
  cherryPick,
  createBranch,
  getCurrentBranchName,
  getRecentCommitsForBranch,
  pullBranch,
  pushBranch,
} from '@/domains/git/git.service.js';
import { RecentCommit } from '@/domains/git/git.types.js';
import { handleMrUrlGeneration } from '@/domains/mr/flows/mrUrl.flow.js';
import { logger } from '@/infra/logger.js';

export const runSyncFlow = async () => {
  const currentBranch = await getCurrentBranchName();

  if (!currentBranch.startsWith('release/')) {
    logger.error('The sync command must be run from a "release/" branch.');
    return;
  }

  const ticketName = currentBranch.replace('release/', '');
  const defaultSyncBranchName = `sync/${ticketName}`;

  const fetchSpinner = ora('Fetching recent commits...').start();
  const recentCommits = await getRecentCommitsForBranch(currentBranch, 15);
  fetchSpinner.stop();

  if (recentCommits.length === 0) {
    logger.error("No commits found on this branch that aren't in develop.");
    return;
  }

  const selectedHashes = await checkbox({
    message: `Select commits to sync back to ${chalk.bold('develop')}:`,
    choices: recentCommits.map((c) => ({
      name: `${chalk.yellow(c.hash.slice(0, 7))} ${c.message}`,
      value: c.hash,
    })),
    validate: (val) => val.length > 0 || 'Select at least one commit.',
    theme: {
      icon: { cursor: chalk.cyan('❯'), checked: chalk.green('◉'), unchecked: chalk.dim('○') },
      style: { highlight: (text: string) => chalk.cyan(text) },
    },
  });

  const finalBranchName = await input({
    message: 'Sync branch name:',
    default: defaultSyncBranchName,
    validate: (val) => val.trim().length > 0 || 'Branch name is required',
  });

  const confirmed = await confirmSyncPlan({
    branchName: finalBranchName,
    hashes: selectedHashes,
    commits: recentCommits,
  });

  if (!confirmed) {
    logger.info('Sync aborted.');
    return;
  }

  const actionSpinner = ora().start();

  try {
    actionSpinner.text = `Updating ${chalk.bold('develop')}...`;
    await checkoutBranch('develop');
    await pullBranch('develop');

    actionSpinner.text = `Creating branch ${chalk.cyan(finalBranchName)}...`;
    await createBranch(finalBranchName);

    actionSpinner.text = `Cherry-picking commits...`;
    await cherryPick(selectedHashes.reverse());

    actionSpinner.text = `Pushing ${chalk.cyan(finalBranchName)}...`;
    await pushBranch(finalBranchName);

    actionSpinner.succeed(`Successfully pushed ${chalk.green.bold(finalBranchName)}`);

    console.log(`\n  ${chalk.green('✔')} Done! Back on ${chalk.dim(currentBranch)}\n`);

    await handleMrUrlGeneration({ sourceBranch: finalBranchName, targetBranch: 'develop' });

    await checkoutBranch(currentBranch);
  } catch (error) {
    actionSpinner.fail(`Sync failed: ${(error as Error).message}`);

    // Attempt to return to original branch
    await checkoutBranch(currentBranch);
  }
};

const formatCommitLine = (hash: string, message?: string) => {
  const shortHash = chalk.yellow(hash.slice(0, 7));
  const msg = message ? chalk.white(message) : chalk.dim('(no message)');
  return `  ${shortHash}  ${msg}`;
};

const confirmSyncPlan = async (data: {
  branchName: string;
  hashes: string[];
  commits: RecentCommit[];
}): Promise<boolean> => {
  console.log('\n' + chalk.bold('  Sync Plan (Backport)'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log(`  ${chalk.dim('Branch:')}  ${chalk.cyan(data.branchName)}`);
  console.log(`  ${chalk.dim('Target:')}  ${chalk.cyan('develop')}`);
  console.log(`  ${chalk.dim('Commits:')} ${chalk.white(data.hashes.length.toString())}`);
  console.log('');

  for (const hash of data.hashes) {
    const commit = data.commits.find((c) => c.hash === hash);
    console.log(formatCommitLine(hash, commit?.message));
  }

  console.log(chalk.dim('  ─────────────────────────────────────\n'));

  return await confirm({
    message: 'Proceed with this sync?',
    default: true,
  });
};
