import { execa } from 'execa';

import { JIRA_REGEX } from '../jira/jira.constants.js';
import { formatCommits } from './git.formatter.js';
import { RecentCommit } from './git.types.js';

export const checkoutBranch = async (branch: string) => {
  try {
    await execa('git', ['checkout', branch], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to checkout branch ${branch}: ${(error as Error).message}`);
  }
};

export const pullBranch = async (branch: string) => {
  try {
    await execa('git', ['pull', 'origin', branch], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to pull branch ${branch}: ${(error as Error).message}`);
  }
};

export const createBranch = async (branch: string) => {
  try {
    await execa('git', ['checkout', '-b', branch], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to create branch ${branch}: ${(error as Error).message}`);
  }
};

export const localBranchExists = async (branch: string) => {
  const result = await execa('git', ['branch', '--list', branch], { reject: false });

  return result.stdout.trim().length > 0;
};

export const deleteLocalBranch = async (branch: string) => {
  try {
    await execa('git', ['branch', '-D', branch], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to delete branch ${branch}: ${(error as Error).message}`);
  }
};

export const checkoutAndCreateBranch = async (base: string, newBranch: string) => {
  await checkoutBranch(base);
  await pullBranch(base);
  await createBranch(newBranch);
};

export const getStagedChangesDiff = async (): Promise<string> => {
  const { stdout } = await execa('git', [
    'diff',
    '--cached',
    '--ignore-all-space',
    '--ignore-blank-lines',
    '-U5',
    '--diff-algorithm=histogram',
    '--',
    ':!**/*.lock',
    ':!**/*.svg',
    ':!**/*.png',
    ':!**/*.jpg',
    ':!**/*.jpeg',
    ':!**/*.map',
    ':!**/dist/**',
    ':!**/build/**',
    ':!**/node_modules/**',
    ':!**/*.min.js',
  ]);

  if (!stdout.trim()) return '';

  const MAX_CHARS = 15_000;
  return stdout.length > MAX_CHARS
    ? stdout.slice(0, MAX_CHARS) + '\n[diff truncated for length]'
    : stdout;
};

export const getRecentCommitsForDevelop = async ({
  limit = 50,
  onlyUnmerged = false,
  author = '',
}: {
  limit: number;
  onlyUnmerged: boolean;
  author: string;
}): Promise<RecentCommit[]> => {
  if (onlyUnmerged) {
    // Get candidate commits from develop not in main (by SHA)
    const { stdout: developStdout } = await execa('git', [
      'log',
      'origin/main...develop',
      '--right-only',
      '--no-merges',
      '--pretty=format:%h|%an|%ad|%s',
      '--date=relative',
      '-n',
      String(limit),
      ...(author ? ['--author', author] : []),
    ]);

    if (developStdout === '') return [];

    // Bounded so cost does not grow with repo history; a released duplicate is always recent.
    const MAIN_SUBJECT_LOOKBACK = 1000;
    const { stdout: mainStdout } = await execa('git', [
      'log',
      'origin/main',
      '--no-merges',
      '--pretty=format:%s',
      '-n',
      String(MAIN_SUBJECT_LOOKBACK),
    ]);

    const mainSubjects = new Set(mainStdout.split('\n').filter(Boolean));

    // Keep only commits whose subject doesn't exist in main
    const filtered = developStdout.split('\n').filter((line) => {
      const subject = line.split('|').slice(3).join('|'); // handle pipes in subject
      return !mainSubjects.has(subject);
    });

    return filtered.length ? formatCommits(filtered) : [];
  }

  const { stdout } = await execa('git', [
    'log',
    'develop',
    '--pretty=format:%h|%an|%ad|%s',
    '--date=relative',
    '-n',
    String(limit),
    ...(author ? ['--author', author] : []),
  ]);

  if (stdout === '') return [];
  return formatCommits(stdout.split('\n'));
};

export const cherryPick = async (hashes: string[]) =>
  execa('git', ['cherry-pick', ...hashes], { stdio: 'inherit' });

export const getCurrentBranchName = async () => {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout;
};

export const getCurrentBranchNameForWorktree = async () => {
  const { stdout } = await execa('git', ['branch', '--show-current']);
  return stdout.trim();
};

export const fetchBranchFromRemote = async (remote: string, branch: string) => {
  await execa('git', ['fetch', remote, branch], { stdio: 'inherit' });
};

export const fetchOriginPrune = async () => {
  await execa('git', ['fetch', 'origin', '--prune'], { stdio: 'inherit' });
};

export const isWorkingTreeDirty = async () => {
  const [unstagedChanges, stagedChanges] = await Promise.all([
    execa('git', ['diff', '--quiet'], { reject: false }),
    execa('git', ['diff', '--cached', '--quiet'], { reject: false }),
  ]);

  return unstagedChanges.exitCode !== 0 || stagedChanges.exitCode !== 0;
};

export const rebaseOntoRemoteBranch = async (branchName: string) => {
  await execa('git', ['rebase', `origin/${branchName}`], { stdio: 'inherit' });
};

export const rebaseOntoRemoteBranchInteractive = async (branchName: string) => {
  await execa('git', ['rebase', '--interactive', `origin/${branchName}`], { stdio: 'inherit' });
};

export const abortRebase = async () => {
  await execa('git', ['rebase', '--abort'], { stdio: 'inherit', reject: false });
};

export const inferJiraScopeFromBranch = (branch: string) => {
  const scopeMatch = branch.match(JIRA_REGEX);
  if (!scopeMatch) return '';

  return scopeMatch ? scopeMatch[0] : '';
};

export const getScopeFromCommitMessage = (commitMessage: string): string => {
  const match = commitMessage.match(JIRA_REGEX);
  const jiraScope = match?.[0] ?? '';

  if (jiraScope) return jiraScope;

  const fallbackScope = commitMessage.split(':')[0]?.trim() ?? '';
  return fallbackScope;
};

export const getRemoteOriginUrl = async () => {
  const { stdout } = await execa('git', ['remote', 'get-url', 'origin']);
  return stdout;
};

export const remoteBranchExists = async (branchName: string) => {
  const result = await execa('git', ['ls-remote', '--exit-code', '--heads', 'origin', branchName], {
    reject: false,
  });

  return result.exitCode === 0;
};

export const remoteTrackingBranchExists = async (branchName: string) => {
  const result = await execa(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`],
    {
      reject: false,
    },
  );

  return result.exitCode === 0;
};

export const getMergeBase = async (ref1: string, ref2: string): Promise<string> => {
  const result = await execa('git', ['merge-base', ref1, ref2], { reject: false });
  return result.exitCode === 0 ? result.stdout.trim() : '';
};

export const countCommitsBetween = async (from: string, to: string): Promise<number> => {
  const result = await execa('git', ['rev-list', '--count', `${from}..${to}`], { reject: false });
  return result.exitCode === 0 ? Number(result.stdout.trim()) || 0 : 0;
};

export const abortCherryPick = async (): Promise<void> => {
  try {
    await execa('git', ['cherry-pick', '--abort'], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to abort cherry-pick: ${(error as Error).message}`);
  }
};

export const commitWithMessage = async (message: string): Promise<void> => {
  await execa('git', ['commit', '-m', message], { stdio: 'inherit' });
};

export const pushCurrentBranch = async (): Promise<void> => {
  await execa('git', ['push'], { stdio: 'inherit' });
};

export const pushCurrentBranchWithLease = async (): Promise<void> => {
  await execa('git', ['push', '--force-with-lease'], { stdio: 'inherit' });
};
