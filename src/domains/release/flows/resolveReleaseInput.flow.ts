import inquirer from 'inquirer';
import ora from 'ora';

import {
  checkoutBranch,
  fetchRemote,
  getRecentCommitsForDevelop,
  pullBranch,
} from '@/domains/git/git.service.js';

import type { ReleaseInput, ReleaseOptions } from '../release.types.js';
import { resolveListBasedRelease } from './resolveListBasedRelease.flow.js';
import { resolveManualRelease } from './resolveManualRelease.flow.js';

export const resolveReleaseInput = async (options: ReleaseOptions): Promise<ReleaseInput> => {
  const { pickMethod } = await inquirer.prompt<{ pickMethod: 'manual' | 'list' }>([
    {
      type: 'list',
      name: 'pickMethod',
      message: 'How do you want to select commits?',
      choices: [
        { name: 'Select from recent commits', value: 'list' },
        { name: 'Paste commit hashes manually', value: 'manual' },
      ],
    },
  ]);

  if (pickMethod === 'manual') {
    return resolveManualRelease();
  }

  const spinner = ora('Fetching recent commits from develop...').start();

  try {
    await checkoutBranch('develop');
    await pullBranch('develop');

    if (options.onlyUnmerged) {
      await fetchRemote('origin');
    }

    const recentCommits = await getRecentCommitsForDevelop({
      limit: 50,
      onlyUnmerged: options.onlyUnmerged,
      author: options.author,
    });

    spinner.succeed(`Fetched ${recentCommits.length} commits from develop.`);

    if (recentCommits.length === 0) {
      throw new Error('No matching commits found.');
    }

    return resolveListBasedRelease(recentCommits);
  } catch (err) {
    spinner.fail('Failed to fetch commits from develop.');
    throw err;
  }
};
