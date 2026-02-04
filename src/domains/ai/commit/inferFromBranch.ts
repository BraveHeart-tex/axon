import { CommitType } from './types.js';

export const inferIntentFromBranch = (branch: string): string | undefined => {
  const cleaned = branch
    .replace(/^(feat|fix|refactor|chore|docs)[/|-]/, '')
    .replace(/^[A-Z]+-\d+[/|-]/, '')
    .replace(/[-_]/g, ' ')
    .trim();

  return cleaned || undefined;
};

export const inferCommitTypeFromBranch = (branch: string): CommitType | undefined => {
  if (branch.startsWith('feat/')) return 'feat';
  if (branch.startsWith('fix/')) return 'fix';
  if (branch.startsWith('refactor/')) return 'refactor';
  if (branch.startsWith('docs/')) return 'docs';
  if (branch.startsWith('chore/')) return 'chore';
  return undefined;
};
