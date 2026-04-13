import c from 'ansi-colors';
import inquirer from 'inquirer';

export const promptRecreateReleaseBranch = async (branch: string): Promise<boolean> => {
  const { recreate } = await inquirer.prompt<{ recreate: boolean }>([
    {
      type: 'confirm',
      name: 'recreate',
      message: `${c.cyan(branch)} already exists. Delete and create a new release branch?`,
      default: false,
    },
  ]);

  return recreate;
};
