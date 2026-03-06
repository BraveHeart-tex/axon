import chalk from 'chalk';
import inquirer from 'inquirer';

import { COMMIT_LABELS } from '../feature.constants.js';

export const resolveBranchMeta = async (issueKey: string) => {
  const issueContext = chalk.dim(`  Issue: ${chalk.bold(issueKey)}`);

  const { commitLabel, shortDesc } = await inquirer.prompt<{
    commitLabel: string;
    shortDesc: string;
  }>([
    {
      type: 'list',
      name: 'commitLabel',
      message: `${issueContext}\n  Branch type:`,
      choices: COMMIT_LABELS,
    },
    {
      type: 'input',
      name: 'shortDesc',
      message: 'Short description (optional):',
    },
  ]);

  const slug = shortDesc
    ? shortDesc
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';

  return { commitLabel, slug };
};
