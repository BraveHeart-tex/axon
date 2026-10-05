import { BRANCH_TYPES, CommitType, toCommitType } from '@/domains/branch/branch.constants.js';

const BRANCH_TYPE_PREFIX = new RegExp(`^(${BRANCH_TYPES.join('|')})[/|-]`);

export const inferIntentFromBranch = (branch: string): string | undefined => {
  const cleaned = branch
    .replace(BRANCH_TYPE_PREFIX, '')
    .replace(/^[A-Z]+-\d+[/|-]/, '')
    .replace(/[-_]/g, ' ')
    .trim();

  return cleaned || undefined;
};

export const inferCommitTypeFromBranch = (branch: string): CommitType | undefined => {
  const type = BRANCH_TYPES.find((candidate) => branch.startsWith(`${candidate}/`));
  return type ? toCommitType(type) : undefined;
};
