import {
  getCurrentBranchName,
  getStagedChangesDiff,
  inferJiraScopeFromBranch,
} from '@/domains/git/git.service.js';
import { editMessageInline } from '@/shared/editMessageInline.js';

import { inferCommitTypeFromBranch, inferIntentFromBranch } from '../inferFromBranch.js';
import { CommitType } from '../types.js';

export interface CommitContext {
  diff: string;
  userHint?: string;
  branchName: string;
  inferredScope?: string;
  branchIntent?: string;
  expectedType?: CommitType;
}

export const resolveCommitContext = async (): Promise<CommitContext> => {
  const diff = await getStagedChangesDiff();

  if (!diff) {
    throw new Error('No staged changes found. Stage your changes with git add first.');
  }

  const hint = await editMessageInline({
    prompt: 'Why are you making this change? (optional, press Enter to skip): ',
  });

  const branchName = await getCurrentBranchName();

  return {
    diff,
    userHint: hint?.trim() || undefined,
    branchName,
    inferredScope: inferJiraScopeFromBranch(branchName) || undefined,
    branchIntent: inferIntentFromBranch(branchName),
    expectedType: inferCommitTypeFromBranch(branchName),
  };
};
