import inquirer from 'inquirer';

import {
  checkoutBranch,
  cherryPickCommit,
  createBranch,
  fetchRemote,
  formatCommitChoice,
  getRecentCommitsForDevelop,
  getScopeFromCommitMessage,
  pullBranch,
} from '../utils/git.js';
import { logger } from '../utils/logger.js';

export interface ReleaseOptions {
  onlyUnmerged: boolean;
  author: string;
}

export const createReleaseBranch = async (options: ReleaseOptions) => {
  const { pickMethod } = await inquirer.prompt<{ pickMethod: 'manual' | 'list' }>([
    {
      type: 'list',
      name: 'pickMethod',
      message: 'How do you want to select commits?',
      choices: [
        { name: 'Paste commit hashes manually', value: 'manual' },
        { name: 'Select from recent commits', value: 'list' },
      ],
    },
  ]);

  let commits: string[] = [];
  let branchTitle = '';
  const branchPrefix = 'release';

  if (pickMethod === 'manual') {
    const { commitHashes } = await inquirer.prompt<{ commitHashes: string }>([
      {
        type: 'input',
        name: 'commitHashes',
        message: 'Paste the commit hashes (space-separated):',
        validate: (input) => input.trim() !== '' || '❌ At least one commit hash is required.',
      },
    ]);

    commits = commitHashes.split(/\s+/);

    const { title } = await inquirer.prompt<{ title: string }>([
      {
        type: 'input',
        name: 'title',
        message: `Enter the release branch title ${branchPrefix}/YOUR_INPUT`,
        transformer: (input) => `${branchPrefix}/${input}`,
        validate: (input) => input.trim() !== '' || '❌ Title is required.',
      },
    ]);

    branchTitle = title;
  } else {
    logger.info('Checking out develop and pulling latest changes...');
    if (options.onlyUnmerged) {
      logger.warn('Only unmerged commits will be shown.');
    }

    await checkoutBranch('develop');
    await pullBranch('develop');

    if (options.onlyUnmerged) {
      logger.info('Fetching main branch since only unmerged commits are requested...');
      await fetchRemote('origin');
    }

    const recentCommits = await getRecentCommitsForDevelop({
      limit: 50,
      onlyUnmerged: options.onlyUnmerged,
      author: options.author,
    });

    if (recentCommits.length === 0) {
      logger.warn(`No ${options.onlyUnmerged ? 'unmerged' : ''} commits found on develop branch.`);
      return;
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

    if (selectedCommits.length > 1) {
      const { title } = await inquirer.prompt<{ title: string }>([
        {
          type: 'input',
          name: 'title',
          message: `Enter the release branch title ${branchPrefix}/YOUR_INPUT`,
          transformer: (input) => `${branchPrefix}/${input}`,
          validate: (input) => input.trim() !== '' || '❌ Title is required.',
        },
      ]);

      branchTitle = title;
    } else {
      branchTitle = `${branchPrefix}/${getScopeFromCommitMessage(selectedCommits[0])}`;
    }

    commits = selectedCommits.map((commit) => commit.split(':')[0]);
  }

  try {
    logger.info('Checking out main and pulling latest changes...');
    await checkoutBranch('main');
    await pullBranch('main');

    logger.info(`Creating release branch: ${branchTitle}`);
    await createBranch(branchTitle);

    logger.info('🍒 Cherry-picking commits:');
    for (const commit of commits) {
      logger.info(`- ${commit}`);
      try {
        await cherryPickCommit(commit);
      } catch {
        logger.error(`Cherry-pick failed on commit ${commit}`);
        return;
      }
    }

    logger.info(`✅ Release branch ${branchTitle} created and commits cherry-picked.`);
  } catch (err) {
    logger.error(`Git operation failed: ${(err as Error).message}`);
  }
};
