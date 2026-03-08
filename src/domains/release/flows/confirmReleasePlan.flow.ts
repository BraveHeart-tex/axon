import chalk from 'chalk';
import inquirer from 'inquirer';

import { ReleasePlan } from '../release.types.js';

const formatCommitLine = (hash: string, message?: string) => {
  const shortHash = chalk.yellow(hash.slice(0, 7));
  const msg = message ? chalk.white(message) : chalk.dim('(no message)');
  return `  ${shortHash}  ${msg}`;
};

export const confirmReleasePlan = async (plan: ReleasePlan): Promise<boolean> => {
  const { branchTitle, commits, recentCommits } = plan;

  console.log('');
  console.log(chalk.bold('  Release Plan'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log(`  ${chalk.dim('Branch:')}  ${chalk.cyan(branchTitle)}`);
  console.log(`  ${chalk.dim('Target:')}  ${chalk.cyan('main')}`);
  console.log(`  ${chalk.dim('Commits:')} ${chalk.white(commits.length.toString())}`);
  console.log('');

  for (const hash of commits) {
    const full = recentCommits.find((c) => c.hash === hash);
    console.log(formatCommitLine(hash, full?.message));
  }

  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('');

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Proceed with this release?',
      default: true,
    },
  ]);

  return confirmed;
};
