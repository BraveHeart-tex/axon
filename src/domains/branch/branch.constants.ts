export const BRANCH_TYPES = [
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

export type BranchType = (typeof BRANCH_TYPES)[number];

const FIX_ALIASES = ['hotfix', 'security'] as const;

type FixAlias = (typeof FIX_ALIASES)[number];

export type CommitType = Exclude<BranchType, FixAlias>;

const isFixAlias = (type: BranchType): type is FixAlias =>
  (FIX_ALIASES as readonly string[]).includes(type);

export const COMMIT_TYPES = BRANCH_TYPES.filter((type): type is CommitType => !isFixAlias(type));

export const toCommitType = (type: BranchType): CommitType => (isFixAlias(type) ? 'fix' : type);
