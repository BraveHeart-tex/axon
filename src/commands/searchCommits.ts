import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import inquirer from 'inquirer';

export const searchCommits = async (jiraKey: string) => {
  const { stdout } = await execa('git', ['log', '--oneline', `--grep=${jiraKey}`]);

  if (!stdout) {
    logger.info(`No commits found for ${jiraKey}`);
    return;
  }

  const commits = stdout.split('\n').map((line) => {
    const [hash, ...msgParts] = line.trim().split(' ');
    return {
      hash,
      message: msgParts.join(' '),
    };
  });

  const { selectedCommits } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedCommits',
      message: `Select commits for ${jiraKey}:`,
      choices: commits.map((c) => ({
        name: `${c.hash}  ${c.message}`,
        value: c.hash,
      })),
    },
  ]);

  logger.info(`You selected: ${selectedCommits}`);
};
