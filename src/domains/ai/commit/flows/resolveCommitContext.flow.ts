import {
  getCurrentBranchName,
  getStagedChangesDiff,
  inferJiraScopeFromBranch,
  inferScopeTypeFromBranch,
} from '@/domains/git/git.service.js';

export interface CommitContext {
  diff: string;
  inferredScope?: string;
  inferredScopeType?: string;
}

export const resolveCommitContext = async (): Promise<CommitContext> => {
  const diff = await getStagedChangesDiff();
  if (!diff) {
    throw new Error('No staged changes found.');
  }

  const branchName = await getCurrentBranchName();

  return {
    diff,
    inferredScope: inferJiraScopeFromBranch(branchName),
    inferredScopeType: inferScopeTypeFromBranch(branchName),
  };
};
