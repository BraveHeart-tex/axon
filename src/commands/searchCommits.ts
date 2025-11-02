import inquirer from 'inquirer';

import { getCommitsByGrep, parseGitLog } from '../utils/git.js';
import { logger } from '../utils/logger.js';

interface SearchCommitsAnswers {
  selectedCommits: string[];
}

export const searchCommits = async (jiraKey: string) => {
  const stdout = await getCommitsByGrep(jiraKey);

  if (!stdout) {
    logger.info(`No commits found for ${jiraKey}`);
    return;
  }

  const commits = parseGitLog(stdout);

  const { selectedCommits } = await inquirer.prompt<SearchCommitsAnswers>([
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

  logger.info(`You selected: ${selectedCommits.join(' ')}`);
};
