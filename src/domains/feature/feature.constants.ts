export const COMMIT_LABELS = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'ci',
  'perf',
  'hotfix',
  'security',
] as const;

const WORK_TYPE_BRANCH_TYPE: Record<string, (typeof COMMIT_LABELS)[number]> = {
  bug: 'fix',
};

export const suggestBranchType = (workType?: string): string | undefined => {
  if (!workType) return undefined;
  return WORK_TYPE_BRANCH_TYPE[workType.toLowerCase()];
};
