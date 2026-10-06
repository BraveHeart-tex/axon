import inquirer from 'inquirer';
import ora from 'ora';

import { fetchBranchFromRemote, getRecentCommitsForDevelop } from '@/domains/git/git.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { resolveListBasedRelease } from '@/domains/release/flows/resolveListBasedRelease.flow.js';
import { resolveManualRelease } from '@/domains/release/flows/resolveManualRelease.flow.js';
import { updateBranchSafely } from '@/domains/release/flows/updateBranchSafely.flow.js';
import type { ReleaseInput, ReleaseOptions } from '@/domains/release/release.types.js';

export const resolveReleaseInput = async (
  options: ReleaseOptions,
  context: ProjectContext,
): Promise<ReleaseInput> => {
  if (context.flow.name !== 'gitflow') throw new Error('Release requires the gitflow flow.');
  const { mainBranch, developBranch, releasePrefix } = context.flow;

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
    const spinner = ora(`Fetching ${mainBranch}...`).start();
    try {
      await fetchBranchFromRemote('origin', mainBranch);
      spinner.succeed(`Fetched latest ${mainBranch}.`);
    } catch (err) {
      spinner.fail(`Failed to fetch ${mainBranch}.`);
      throw err;
    }
    return resolveManualRelease(releasePrefix);
  }

  const fetchSpinner = ora(`Fetching ${mainBranch} and ${developBranch}...`).start();
  try {
    await fetchBranchFromRemote('origin', mainBranch, developBranch);
    fetchSpinner.succeed(`Fetched latest ${mainBranch} and ${developBranch}.`);
  } catch (error) {
    fetchSpinner.fail(`Failed to fetch ${mainBranch} and ${developBranch}.`);
    throw error;
  }

  await updateBranchSafely(developBranch, { skipFetch: true });

  const spinner = ora(`Fetching ${mainBranch}...`).start();

  try {
    spinner.text = `Fetching recent commits from ${developBranch}...`;
    const recentCommits = await getRecentCommitsForDevelop({
      limit: 50,
      mainBranch,
      developBranch,
      onlyUnmerged: true,
      author: options.author,
    });

    spinner.succeed(`Fetched ${recentCommits.length} commits from ${developBranch}.`);

    if (recentCommits.length === 0) {
      throw new Error('No matching commits found.');
    }

    return resolveListBasedRelease(recentCommits, releasePrefix, context.jira);
  } catch (err) {
    spinner.fail(`Failed to fetch commits from ${developBranch}.`);
    throw err;
  }
};
