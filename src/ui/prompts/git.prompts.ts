import c from 'ansi-colors';
import inquirer from 'inquirer';

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
