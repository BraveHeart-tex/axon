import {
  inferCommitTypeFromBranch,
  inferIntentFromBranch,
} from '@/domains/ai/commit/inferFromBranch.js';
import { CommitType } from '@/domains/branch/branch.constants.js';
import { parseBranchName } from '@/domains/branch/branchTemplate.js';
import {
  getCurrentBranchName,
  getStagedChangesDiff,
  inferJiraScopeFromBranch,
} from '@/domains/git/git.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { editMessageInline } from '@/shared/editMessageInline.js';

export interface CommitContext {
  diff: string;
  userHint?: string;
  branchName: string;
  inferredScope?: string;
  branchIntent?: string;
  expectedType?: CommitType;
}

export const resolveCommitContext = async (context?: ProjectContext): Promise<CommitContext> => {
  const diff = await getStagedChangesDiff();

  if (!diff) {
    throw new Error('No staged changes found. Stage your changes with git add first.');
  }

  const hint = await editMessageInline({
    prompt: 'Why are you making this change? (optional, press Enter to skip): ',
  });

  const branchName = await getCurrentBranchName();

  const parsed = context
    ? parseBranchName(context.branchTemplate, branchName, context.jira.projectKeys)
    : null;

  return {
    diff,
    userHint: hint?.trim() || undefined,
    branchName,
    inferredScope:
      parsed?.key ??
      (context?.source === 'project'
        ? undefined
        : inferJiraScopeFromBranch(branchName, context?.jira) || undefined),
    branchIntent: inferIntentFromBranch(branchName, context),
    expectedType: inferCommitTypeFromBranch(branchName, context),
  };
};
