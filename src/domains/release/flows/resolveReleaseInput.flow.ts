import inquirer from 'inquirer';
import ora from 'ora';

import {
  fetchBranchFromRemote,
  getRecentCommitsForDevelop,
} from '@/domains/git/git.service.js';

import type { ReleaseInput, ReleaseOptions } from '../release.types.js';
import { resolveListBasedRelease } from './resolveListBasedRelease.flow.js';
import { resolveManualRelease } from './resolveManualRelease.flow.js';
import { updateBranchSafely } from './updateBranchSafely.flow.js';

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
    const spinner = ora('Updating main...').start();
    try {
      await fetchBranchFromRemote('origin', 'main');
      spinner.succeed('Fetched latest main.');
    } catch (err) {
      spinner.fail('Failed to fetch main.');
      throw err;
    }
    return resolveManualRelease();
  }

  // Single combined fetch for main + develop — must run before the develop update
  // and before the spinner starts.
  await fetchBranchFromRemote('origin', 'main', 'develop');

  // Interactive (may prompt to rebase) — must run before the spinner starts.
  await updateBranchSafely('develop', { skipFetch: true });

  const spinner = ora('Updating main...').start();

  try {
    spinner.text = 'Fetching recent commits from develop...';
    const recentCommits = await getRecentCommitsForDevelop({
      limit: 50,
      onlyUnmerged: true,
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
