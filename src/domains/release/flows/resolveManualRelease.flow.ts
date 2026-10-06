import inquirer from 'inquirer';

import type { ReleaseInput } from '@/domains/release/release.types.js';

export const resolveManualRelease = async (releasePrefix = 'release/'): Promise<ReleaseInput> => {
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
      message: `Release branch name: ${releasePrefix}`,
      validate: (input) => input.trim() !== '' || '❌ Title is required.',
    },
  ]);

  const branchTitle = `${releasePrefix}${title.trim()}`;

  return {
    commits,
    branchTitle,
    recentCommits: [],
  };
};
