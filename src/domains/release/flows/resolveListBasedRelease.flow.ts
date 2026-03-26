import { checkbox, input } from '@inquirer/prompts';
import chalk from 'chalk';

import { formatCommitChoice } from '@/domains/git/git.formatter.js';
import { getScopeFromCommitMessage } from '@/domains/git/git.service.js';
import type { RecentCommit } from '@/domains/git/git.types.js';

import type { ReleaseInput } from '../release.types.js';

const BRANCH_PREFIX = 'release';

export const resolveListBasedRelease = async (
  recentCommits: RecentCommit[],
): Promise<ReleaseInput> => {
  const selectedHashes = await checkbox({
    message: 'Select commits to cherry-pick:',
    pageSize: 15,
    loop: false,
    choices: recentCommits.slice().reverse().map(formatCommitChoice),
    validate: (input) => input.length > 0 || '❌ Select at least one commit.',
    theme: {
      prefix: chalk.cyan('?'),
      icon: {
        cursor: chalk.cyan('❯'),
        checked: chalk.green('◉'),
        unchecked: chalk.dim('◯'),
      },
      style: {
        highlight: (text: string) => chalk.cyan(text),
        renderSelectedChoices: (selected: Array<{ short: string }>) =>
          chalk.green(`${selected.length} commit(s) selected`),
      },
    },
  });

  const selectedCommits = recentCommits.filter((c) => selectedHashes.includes(c.hash));

  const suggestedTitle =
    selectedCommits.length === 1 ? getScopeFromCommitMessage(selectedCommits[0]!.message) : '';

  const title = await input({
    message: `Branch name (${chalk.dim(`${BRANCH_PREFIX}/`)}):`,
    default: suggestedTitle,
    validate: (val) => val.trim() !== '' || '❌ Title is required.',
  });

  return {
    branchTitle: `${BRANCH_PREFIX}/${title.trim()}`,
    commits: selectedHashes,
    recentCommits: selectedCommits,
  };
};
