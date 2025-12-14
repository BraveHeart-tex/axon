import chalk from 'chalk';
import inquirer from 'inquirer';

import { COMMIT_LABELS } from '../feature.constants.js';

export const resolveBranchMeta = async (issueKey: string) => {
  const issueContext = chalk.dim(`\n  Issue: ${chalk.bold(issueKey)}`);

  const { commitLabel } = await inquirer.prompt<{ commitLabel: string }>([
    {
      type: 'list',
      name: 'commitLabel',
      message: `Select a branch type:${issueContext}`,
      choices: COMMIT_LABELS,
    },
  ]);

  const { shortDesc } = await inquirer.prompt<{ shortDesc: string }>([
    {
      type: 'input',
      name: 'shortDesc',
      message: 'Optional short description (e.g., add-logging):',
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
