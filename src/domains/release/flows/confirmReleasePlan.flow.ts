import c from 'ansi-colors';
import inquirer from 'inquirer';

import { ReleasePlan } from '../release.types.js';

const formatCommitLine = (hash: string, message?: string) => {
  const shortHash = c.yellow(hash.slice(0, 7));
  const msg = message ? c.white(message) : c.dim('(no message)');
  return `  ${shortHash}  ${msg}`;
};

export const confirmReleasePlan = async (plan: ReleasePlan): Promise<boolean> => {
  const { branchTitle, commits, recentCommits } = plan;

  console.log('');
  console.log(c.bold('  Release Plan'));
  console.log(c.dim('  ─────────────────────────────────────'));
  console.log(`  ${c.dim('Branch:')}  ${c.cyan(branchTitle)}`);
  console.log(`  ${c.dim('Target:')}  ${c.cyan('main')}`);
  console.log(`  ${c.dim('Commits:')} ${c.white(commits.length.toString())}`);
  console.log('');

  for (const hash of commits) {
    const full = recentCommits.find((c) => c.hash === hash);
    console.log(formatCommitLine(hash, full?.message));
  }

  console.log('');
  console.log(c.dim('  ─────────────────────────────────────'));
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
