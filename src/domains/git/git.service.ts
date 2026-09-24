import { existsSync } from 'node:fs';

import { execa } from 'execa';

import { JIRA_REGEX } from '../jira/jira.constants.js';
import { formatCommits } from './git.formatter.js';
import { RecentCommit } from './git.types.js';

type GitCallOptions = { cancelSignal?: AbortSignal; captureOutput?: boolean };

// Captured git can't show a credential prompt, and a spinner would draw over it: fail instead.
const noPromptEnv = { GIT_TERMINAL_PROMPT: '0' };

const outputOptions = (captureOutput?: boolean) =>
  captureOutput ? { stdio: 'pipe' as const, env: noPromptEnv } : { stdio: 'inherit' as const };

export const checkoutBranch = async (branch: string) => {
  try {
    await execa('git', ['checkout', branch]);
  } catch (error) {
    throw new Error(`Failed to checkout branch ${branch}: ${(error as Error).message}`);
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

export const checkoutDetached = async (ref: string, { cancelSignal }: GitCallOptions = {}) => {
  try {
    await execa('git', ['checkout', '--detach', ref], { cancelSignal });
  } catch (error) {
    throw new Error(`Failed to checkout ${ref}: ${(error as Error).message}`);
  }
};

export const resolveCommitSha = async (ref: string) => {
  const result = await execa('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    reject: false,
  });

  return result.exitCode === 0 ? result.stdout.trim() : '';
};

export const updateLocalBranchRef = async (branch: string, newSha: string, oldSha: string) => {
  try {
    await execa('git', ['update-ref', `refs/heads/${branch}`, newSha, oldSha]);
  } catch (error) {
    throw new Error(`Failed to update local branch ${branch}: ${(error as Error).message}`);
  }
};

export const getCheckedOutBranches = async (): Promise<Set<string>> => {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain']);
  const prefix = 'branch refs/heads/';

  return new Set(
    stdout
      .split('\n')
      .filter((line) => line.startsWith(prefix))
      .map((line) => line.slice(prefix.length)),
  );
};

export const deleteLocalBranch = async (branch: string) => {
  try {
    await execa('git', ['branch', '-D', branch], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to delete branch ${branch}: ${(error as Error).message}`);
  }
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

export const fetchBranchFromRemote = async (remote: string, ...branches: string[]) => {
  await execa('git', ['fetch', remote, ...branches]);
};

export const fetchOriginPrune = async ({ cancelSignal }: GitCallOptions = {}) => {
  await execa('git', ['fetch', 'origin', '--prune'], { stdio: 'inherit', cancelSignal });
};

export const listRemoteBranches = async (
  branches: string[],
  { cancelSignal }: GitCallOptions = {},
): Promise<Set<string>> => {
  const prefix = 'refs/heads/';

  try {
    const { stdout } = await execa(
      'git',
      ['ls-remote', '--heads', 'origin', ...branches.map((branch) => `${prefix}${branch}`)],
      { cancelSignal, env: noPromptEnv },
    );

    return new Set(
      stdout
        .split('\n')
        .map((line) => line.split('\t')[1] ?? '')
        .filter((ref) => ref.startsWith(prefix))
        .map((ref) => ref.slice(prefix.length)),
    );
  } catch (error) {
    throw new Error(`Failed to list branches on origin: ${(error as Error).message}`);
  }
};

export const fetchOriginBranches = async (
  branches: string[],
  { cancelSignal }: GitCallOptions = {},
) => {
  try {
    await execa(
      'git',
      [
        'fetch',
        'origin',
        ...branches.map((branch) => `+refs/heads/${branch}:refs/remotes/origin/${branch}`),
      ],
      { cancelSignal, env: noPromptEnv },
    );
  } catch (error) {
    throw new Error(`Failed to fetch from origin: ${(error as Error).message}`);
  }
};

export const isAncestor = async (
  ancestor: string,
  descendant: string,
  { cancelSignal }: GitCallOptions = {},
) => {
  const result = await execa('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    reject: false,
    cancelSignal,
  });

  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;

  throw new Error(`Failed to compare ${ancestor} with ${descendant}: ${result.stderr}`);
};

export const isWorkingTreeDirty = async () => {
  const [unstagedChanges, stagedChanges] = await Promise.all([
    execa('git', ['diff', '--quiet'], { reject: false }),
    execa('git', ['diff', '--cached', '--quiet'], { reject: false }),
  ]);

  return unstagedChanges.exitCode !== 0 || stagedChanges.exitCode !== 0;
};

// --fork-point matches `git pull --rebase`: it uses the origin/<branch> reflog to drop
// local commits already integrated upstream under a different SHA (squash-merge, force-push),
// instead of replaying them and hitting spurious conflicts. Without it an explicit-upstream
// rebase defaults to --no-fork-point and fails where `git pull --rebase` succeeds.
export const rebaseOntoRemoteBranch = async (
  branchName: string,
  { cancelSignal, captureOutput }: GitCallOptions = {},
) => {
  await execa('git', ['rebase', '--fork-point', `origin/${branchName}`], {
    ...outputOptions(captureOutput),
    cancelSignal,
  });
};

export const rebaseOntoRemoteBranchInteractive = async (branchName: string) => {
  await execa('git', ['rebase', '--fork-point', '--interactive', `origin/${branchName}`], {
    stdio: 'inherit',
  });
};

export const abortRebase = async () => {
  await execa('git', ['rebase', '--abort'], { stdio: 'inherit', reject: false });
};

export const abortRebaseStrict = async () => {
  try {
    await execa('git', ['rebase', '--abort']);
  } catch (error) {
    throw new Error(`Failed to abort rebase: ${(error as Error).message}`);
  }
};

export const isRebaseInProgress = async () => {
  const { stdout } = await execa('git', [
    'rev-parse',
    '--git-path',
    'rebase-merge',
    '--git-path',
    'rebase-apply',
  ]);

  return stdout.split('\n').some((gitPath) => existsSync(gitPath.trim()));
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

const countRevisionsStrict = async (...args: string[]): Promise<number> => {
  try {
    const { stdout } = await execa('git', ['rev-list', '--count', ...args]);
    return Number(stdout.trim());
  } catch (error) {
    throw new Error(
      `Failed to count commits with \`git rev-list --count ${args.join(' ')}\`: ${(error as Error).message}`,
    );
  }
};

export const countCommitsMissingLocally = (branch: string) =>
  countRevisionsStrict(`refs/heads/${branch}..refs/remotes/origin/${branch}`);

// Commits that are only rebased copies of the remote's (same patch) don't count as local-only.
export const countLocalOnlyCommits = (remoteSha: string, localSha: string) =>
  countRevisionsStrict('--cherry-pick', '--right-only', `${remoteSha}...${localSha}`);

export const getAheadBehind = async (
  branch: string,
): Promise<{ ahead: number; behind: number }> => {
  const result = await execa(
    'git',
    ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`],
    { reject: false },
  );

  if (result.exitCode !== 0) {
    return { ahead: 0, behind: 0 };
  }

  const [ahead, behind] = result.stdout.trim().split(/\s+/);
  return { ahead: Number(ahead) || 0, behind: Number(behind) || 0 };
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

// An empty expectedSha leases "the branch must not exist on the remote yet".
export const pushHeadWithLease = async (
  branch: string,
  expectedSha: string,
  { cancelSignal, captureOutput }: GitCallOptions = {},
): Promise<void> => {
  await execa(
    'git',
    [
      'push',
      `--force-with-lease=refs/heads/${branch}:${expectedSha}`,
      'origin',
      `HEAD:refs/heads/${branch}`,
    ],
    { ...outputOptions(captureOutput), cancelSignal },
  );
};
