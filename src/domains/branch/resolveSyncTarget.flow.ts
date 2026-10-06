import { input } from '@inquirer/prompts';
import c from 'ansi-colors';

import { detectClassifiedParent } from '@/domains/branch/classifiedGuards.js';
import {
  countCommitsBetween,
  getMergeBase,
  remoteTrackingBranchExists,
} from '@/domains/git/git.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { logger } from '@/infra/logger.js';

const BASE_BRANCH_CANDIDATES = ['develop', 'main', 'master'];
const RELEASE_BASE_BRANCH_CANDIDATES = ['main', 'master'];
const FALLBACK_BASE_BRANCH = 'develop';
const FALLBACK_RELEASE_BASE_BRANCH = 'main';

interface BaseCandidate {
  name: string;
  ahead: number;
}

// Returns the candidate the current branch most likely branched from: the one
// with the fewest commits between its merge-base and HEAD (the most recent
// divergence). Ties are broken by the order candidates are passed in.
export const pickClosestBase = (
  candidates: BaseCandidate[],
  fallback = FALLBACK_BASE_BRANCH,
): string => {
  let closest: BaseCandidate | undefined;

  for (const candidate of candidates) {
    if (!closest || candidate.ahead < closest.ahead) {
      closest = candidate;
    }
  }

  return closest ? closest.name : fallback;
};

const detectBaseBranch = async (
  currentBranch: string,
  context?: ProjectContext,
): Promise<string> => {
  const candidates = await Promise.all(
    (context
      ? [
          context.flow.developBranch,
          context.flow.mainBranch,
          ...(context.flow.mainBranch === 'main' ? ['master'] : []),
        ]
      : BASE_BRANCH_CANDIDATES
    )
      .filter((candidate) => candidate !== currentBranch)
      .map(async (candidate): Promise<BaseCandidate | undefined> => {
        if (!(await remoteTrackingBranchExists(candidate))) return;

        const mergeBase = await getMergeBase(`origin/${candidate}`, 'HEAD');
        if (!mergeBase) return;

        const ahead = await countCommitsBetween(mergeBase, 'HEAD');
        return { name: candidate, ahead };
      }),
  );

  return pickClosestBase(
    candidates.filter((candidate) => candidate !== undefined),
    context?.flow.developBranch,
  );
};

// Release branches always merge back into the trunk, so suggest main/master
// directly instead of guessing from merge-bases.
const detectReleaseBaseBranch = async (context?: ProjectContext): Promise<string> => {
  for (const candidate of context
    ? [context.flow.mainBranch, ...(context.flow.mainBranch === 'main' ? ['master'] : [])]
    : RELEASE_BASE_BRANCH_CANDIDATES) {
    if (await remoteTrackingBranchExists(candidate)) return candidate;
  }

  return context?.flow.mainBranch ?? FALLBACK_RELEASE_BASE_BRANCH;
};

export const resolveSyncTarget = async (
  currentBranch: string,
  context?: ProjectContext,
): Promise<string> => {
  if (context?.flow.name === 'classified') {
    const { parent, candidates } = await detectClassifiedParent(currentBranch, context.flow);
    if (!parent && candidates.length)
      logger.warn(
        `Ambiguous ancestry: ${candidates.join(', ')}. Offering ${context.flow.mainBranch}.`,
      );
    const suggested = parent ?? context.flow.mainBranch;
    logger.info(`Detected base branch: ${suggested}${parent ? ` (contains ${parent} head)` : ''}`);
    return (
      await input({
        message: 'Rebase onto branch:',
        default: suggested,
        validate: (val) => val.trim().length > 0 || 'Target branch is required',
      })
    ).trim();
  }
  const suggested = currentBranch.startsWith(
    context?.flow.name === 'gitflow' ? context.flow.releasePrefix : 'release/',
  )
    ? await detectReleaseBaseBranch(context)
    : await detectBaseBranch(currentBranch, context);

  logger.info(`Detected base branch: ${c.bold(suggested)}`);

  const target = await input({
    message: 'Rebase onto branch:',
    default: suggested,
    validate: (val) => val.trim().length > 0 || 'Target branch is required',
  });

  return target.trim();
};
