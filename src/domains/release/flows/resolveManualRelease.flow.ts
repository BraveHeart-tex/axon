import inquirer from 'inquirer';

import type { ReleaseInput } from '../release.types.js';

const BRANCH_PREFIX = 'release';

export const resolveManualRelease = async (): Promise<ReleaseInput> => {
  const { commitHashes } = await inquirer.prompt<{ commitHashes: string }>([
    {
      type: 'input',
      name: 'commitHashes',
      message: 'Paste commit hashes (space-separated):',
      validate: (input) => input.trim() !== '' || '❌ At least one commit hash is required.',
    },
  ]);

  const commits = commitHashes.trim().split(/\s+/);

  const { title } = await inquirer.prompt<{ title: string }>([
    {
      type: 'input',
      name: 'title',
      message: `Release branch name: ${BRANCH_PREFIX}/`,
      validate: (input) => input.trim() !== '' || '❌ Title is required.',
    },
  ]);

  const branchTitle = `${BRANCH_PREFIX}/${title.trim()}`;

  return {
    commits,
    branchTitle,
    recentCommits: [],
  };
};
