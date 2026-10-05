import type { BranchType } from '@/domains/branch/branch.constants.js';

const WORK_TYPE_BRANCH_TYPE: Record<string, BranchType> = {
  bug: 'fix',
};

export const suggestBranchType = (workType?: string): BranchType | undefined => {
  if (!workType) return undefined;
  return WORK_TYPE_BRANCH_TYPE[workType.toLowerCase()];
};
