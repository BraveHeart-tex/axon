import inquirer from 'inquirer';

const BRANCH_PREFIX = 'release';

export const resolveManualRelease = async () => {
  const { commitHashes } = await inquirer.prompt<{ commitHashes: string }>([
    {
      type: 'input',
      name: 'commitHashes',
      message: 'Paste the commit hashes (space-separated):',
      validate: (input) => input.trim() !== '' || '❌ At least one commit hash is required.',
    },
  ]);

  const { title } = await inquirer.prompt<{ title: string }>([
    {
      type: 'input',
      name: 'title',
      message: `Enter the release branch title ${BRANCH_PREFIX}/YOUR_INPUT`,
      transformer: (input) => `${BRANCH_PREFIX}/${input}`,
      validate: (input) => input.trim() !== '' || '❌ Title is required.',
    },
  ]);

  return {
    commits: commitHashes.split(/\s+/),
    branchTitle: `${BRANCH_PREFIX}/${title}`,
  };
};
