import { checkbox, confirm, input } from '@inquirer/prompts';
import c from 'ansi-colors';
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
    message: `Select commits to sync back to ${c.bold('develop')}:`,
    choices: recentCommits.map((commit) => ({
      name: `${c.yellow(commit.hash.slice(0, 7))} ${commit.message}`,
      value: commit.hash,
    })),
    validate: (val) => val.length > 0 || 'Select at least one commit.',
    theme: {
      icon: { cursor: c.cyan('❯'), checked: c.green('◉'), unchecked: c.dim('○') },
      style: { highlight: (text: string) => c.cyan(text) },
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
    actionSpinner.text = `Updating ${c.bold('develop')}...`;
    await checkoutBranch('develop');
    await pullBranch('develop');

    actionSpinner.text = `Creating branch ${c.cyan(finalBranchName)}...`;
    await createBranch(finalBranchName);

    actionSpinner.text = `Cherry-picking commits...`;
    await cherryPick(selectedHashes.reverse());

    actionSpinner.text = `Pushing ${c.cyan(finalBranchName)}...`;
    await pushBranch(finalBranchName);

    actionSpinner.succeed(`Successfully pushed ${c.green.bold(finalBranchName)}`);

    console.log(`\n  ${c.green('✔')} Done! Back on ${c.dim(currentBranch)}\n`);

    await handleMrUrlGeneration({ sourceBranch: finalBranchName, targetBranch: 'develop' });

    await checkoutBranch(currentBranch);
  } catch (error) {
    actionSpinner.fail(`Sync failed: ${(error as Error).message}`);

    // Attempt to return to original branch
    await checkoutBranch(currentBranch);
  }
};

const formatCommitLine = (hash: string, message?: string) => {
  const shortHash = c.yellow(hash.slice(0, 7));
  const msg = message ? c.white(message) : c.dim('(no message)');
  return `  ${shortHash}  ${msg}`;
};

const confirmSyncPlan = async (data: {
  branchName: string;
  hashes: string[];
  commits: RecentCommit[];
}): Promise<boolean> => {
  console.log('\n' + c.bold('  Sync Plan (Backport)'));
  console.log(c.dim('  ─────────────────────────────────────'));
  console.log(`  ${c.dim('Branch:')}  ${c.cyan(data.branchName)}`);
  console.log(`  ${c.dim('Target:')}  ${c.cyan('develop')}`);
  console.log(`  ${c.dim('Commits:')} ${c.white(data.hashes.length.toString())}`);
  console.log('');

  for (const hash of data.hashes) {
    const commit = data.commits.find((c) => c.hash === hash);
    console.log(formatCommitLine(hash, commit?.message));
  }

  console.log(c.dim('  ─────────────────────────────────────\n'));

  return await confirm({
    message: 'Proceed with this sync?',
    default: true,
  });
};
