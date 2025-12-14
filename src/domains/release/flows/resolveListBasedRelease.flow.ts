import inquirer from 'inquirer';

import { formatCommitChoice } from '@/domains/git/git.formatter.js';
import {
  checkoutBranch,
  fetchRemote,
  getRecentCommitsForDevelop,
  getScopeFromCommitMessage,
  pullBranch,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

import type { ReleaseOptions } from '../release.types.js';

const BRANCH_PREFIX = 'release';

export const resolveListBasedRelease = async (options: ReleaseOptions) => {
  logger.info('Checking out develop and pulling latest changes...');
  await checkoutBranch('develop');
  await pullBranch('develop');

  if (options.onlyUnmerged) {
    logger.warn('Only unmerged commits will be shown.');
    await fetchRemote('origin');
  }

  const recentCommits = await getRecentCommitsForDevelop({
    limit: 50,
    onlyUnmerged: options.onlyUnmerged,
    author: options.author,
  });

  if (recentCommits.length === 0) {
    throw new Error('No matching commits found.');
  }

  const { selectedCommits } = await inquirer.prompt<{ selectedCommits: string[] }>([
    {
      type: 'checkbox',
      name: 'selectedCommits',
      message: 'Select commits to cherry-pick:',
      pageSize: 10,
      choices: recentCommits.map(formatCommitChoice),
      validate: (input) => input.length > 0 || '❌ Select at least one commit.',
    },
  ]);

  const branchTitle =
    selectedCommits.length === 1
      ? `${BRANCH_PREFIX}/${getScopeFromCommitMessage(selectedCommits[0])}`
      : await promptForBranchTitle();

  return {
    branchTitle,
    commits: selectedCommits.map((c) => c.split(':')[0]),
  };
};

const promptForBranchTitle = async () => {
  const { title } = await inquirer.prompt<{ title: string }>([
    {
      type: 'input',
      name: 'title',
      message: 'Enter the release branch title',
      validate: (input) => input.trim() !== '' || '❌ Title is required.',
    },
  ]);

  return `release/${title}`;
};
