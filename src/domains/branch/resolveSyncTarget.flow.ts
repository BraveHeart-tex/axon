import { input } from '@inquirer/prompts';
import c from 'ansi-colors';

import {
  countCommitsBetween,
  getMergeBase,
  remoteBranchExists,
} from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

const BASE_BRANCH_CANDIDATES = ['develop', 'main', 'master'];
const FALLBACK_BASE_BRANCH = 'develop';

interface BaseCandidate {
  name: string;
  ahead: number;
}

// Returns the candidate the current branch most likely branched from: the one
// with the fewest commits between its merge-base and HEAD (the most recent
// divergence). Ties are broken by the order candidates are passed in.
export const pickClosestBase = (candidates: BaseCandidate[]): string => {
  let closest: BaseCandidate | undefined;

  for (const candidate of candidates) {
    if (!closest || candidate.ahead < closest.ahead) {
      closest = candidate;
    }
  }

  return closest ? closest.name : FALLBACK_BASE_BRANCH;
};

const detectBaseBranch = async (currentBranch: string): Promise<string> => {
  const candidates: BaseCandidate[] = [];

  for (const candidate of BASE_BRANCH_CANDIDATES) {
    if (candidate === currentBranch) continue;
    if (!(await remoteBranchExists(candidate))) continue;

    const mergeBase = await getMergeBase(`origin/${candidate}`, 'HEAD');
    if (!mergeBase) continue;

    const ahead = await countCommitsBetween(mergeBase, 'HEAD');
    candidates.push({ name: candidate, ahead });
  }

  return pickClosestBase(candidates);
};

export const resolveSyncTarget = async (currentBranch: string): Promise<string> => {
  const suggested = await detectBaseBranch(currentBranch);

  logger.info(`Detected base branch: ${c.bold(suggested)}`);

  const target = await input({
    message: 'Rebase onto branch:',
    default: suggested,
    validate: (val) => val.trim().length > 0 || 'Target branch is required',
  });

  return target.trim();
};
