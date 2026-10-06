import { BRANCH_TYPES, CommitType, toCommitType } from '@/domains/branch/branch.constants.js';
import { parseBranchName } from '@/domains/branch/branchTemplate.js';
import type { ProjectContext } from '@/domains/project/project.types.js';

const BRANCH_TYPE_PREFIX = new RegExp(`^(${BRANCH_TYPES.join('|')})[/|-]`);

export const inferIntentFromBranch = (
  branch: string,
  context?: ProjectContext,
): string | undefined => {
  if (context) {
    const parsed = parseBranchName(context.branchTemplate, branch, context.jira.projectKeys);
    if (parsed) return parsed.slug?.replace(/-/g, ' ');
    if (context.source === 'project') return undefined;
  }
  const cleaned = branch
    .replace(BRANCH_TYPE_PREFIX, '')
    .replace(/^[A-Z]+-\d+[/|-]/, '')
    .replace(/[-_]/g, ' ')
    .trim();

  return cleaned || undefined;
};

export const inferCommitTypeFromBranch = (
  branch: string,
  context?: ProjectContext,
): CommitType | undefined => {
  if (context) {
    const parsed = parseBranchName(context.branchTemplate, branch, context.jira.projectKeys);
    if (parsed)
      return parsed.type ? toCommitType(parsed.type as (typeof BRANCH_TYPES)[number]) : undefined;
    if (context.source === 'project') return undefined;
  }
  const type = BRANCH_TYPES.find((candidate) => branch.startsWith(`${candidate}/`));
  return type ? toCommitType(type) : undefined;
};
