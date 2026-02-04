import {
  getCurrentBranchName,
  getStagedChangesDiff,
  inferJiraScopeFromBranch,
  inferScopeTypeFromBranch,
} from '@/domains/git/git.service.js';

import { DiffSummary, summarizeDiff } from '../diffSummary.js';
import { inferCommitTypeFromBranch, inferIntentFromBranch } from '../inferFromBranch.js';
import { CommitType } from '../types.js';

export interface CommitContext {
  diff: string;
  inferredScope?: string;
  inferredScopeType?: string;

  diffSummary: DiffSummary;
  branchIntent?: string;
  expectedType?: CommitType;
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
    branchIntent: inferIntentFromBranch(branchName),
    expectedType: inferCommitTypeFromBranch(branchName),
    diffSummary: summarizeDiff(diff),
  };
};
