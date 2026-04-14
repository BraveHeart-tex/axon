import { input } from '@inquirer/prompts';
import c from 'ansi-colors';

import { getScopeFromCommitMessage } from '@/domains/git/git.service.js';
import type { RecentCommit } from '@/domains/git/git.types.js';
import { promptSearchableCommitCheckbox } from '@/ui/prompts/commit.prompts.js';

import type { ReleaseInput } from '../release.types.js';

const BRANCH_PREFIX = 'release';

export const resolveListBasedRelease = async (
  recentCommits: RecentCommit[],
): Promise<ReleaseInput> => {
  const selectedHashes = await promptSearchableCommitCheckbox({
    commits: recentCommits,
    message: 'Select commits to cherry-pick:',
    pageSize: 15,
    requiredMessage: '❌ Select at least one commit.',
  });

  const selectedCommits = recentCommits
    .filter((c) => selectedHashes.includes(c.hash))
    .slice()
    .reverse();

  const selectedScopes = selectedCommits
    .map((commit) => getScopeFromCommitMessage(commit.message))
    .filter((scope) => scope !== '');
  const suggestedTitle =
    selectedScopes.length === selectedCommits.length && new Set(selectedScopes).size === 1
      ? selectedScopes[0]!
      : '';

  const title = await input({
    message: `Branch name (${c.dim(`${BRANCH_PREFIX}/`)}):`,
    default: suggestedTitle,
    validate: (val) => val.trim() !== '' || '❌ Title is required.',
  });

  return {
    branchTitle: `${BRANCH_PREFIX}/${title.trim()}`,
    commits: selectedCommits.map((commit) => commit.hash),
    recentCommits: selectedCommits,
  };
};
