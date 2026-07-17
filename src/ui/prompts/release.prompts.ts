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

export const promptRebaseDivergedBranch = async (
  branch: string,
  ahead: number,
  behind: number,
): Promise<boolean> => {
  const { rebase } = await inquirer.prompt<{ rebase: boolean }>([
    {
      type: 'confirm',
      name: 'rebase',
      message: `${c.cyan(branch)} has diverged from ${c.cyan(`origin/${branch}`)} (${ahead} local, ${behind} remote). Rebase onto ${c.cyan(`origin/${branch}`)}?`,
      default: false,
    },
  ]);

  return rebase;
};
