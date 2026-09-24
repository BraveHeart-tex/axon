import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { execa } from 'execa';

import { JIRA_REGEX } from '../jira/jira.constants.js';
import { formatCommits } from './git.formatter.js';
import { RecentCommit } from './git.types.js';

type GitCallOptions = { cancelSignal?: AbortSignal; captureOutput?: boolean; skipHooks?: boolean };

const gitArgs = (args: string[], skipHooks?: boolean) =>
  skipHooks ? ['-c', 'core.hooksPath=/dev/null', ...args] : args;

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

export const resolveCommitSha = async (ref: string, { skipHooks }: GitCallOptions = {}) => {
  const result = await execa(
    'git',
    gitArgs(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], skipHooks),
    { reject: false },
  );

  return result.exitCode === 0 ? result.stdout.trim() : '';
};

export const updateLocalBranchRef = async (
  branch: string,
  newSha: string,
  oldSha: string,
  { skipHooks }: GitCallOptions = {},
) => {
  try {
    await execa('git', gitArgs(['update-ref', `refs/heads/${branch}`, newSha, oldSha], skipHooks));
  } catch (error) {
    throw new Error(`Failed to update local branch ${branch}: ${(error as Error).message}`);
  }
};

export const getCheckedOutBranches = async ({ skipHooks }: GitCallOptions = {}): Promise<
  Set<string>
> => {
  const { stdout } = await execa('git', gitArgs(['worktree', 'list', '--porcelain'], skipHooks));
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
  { cancelSignal, skipHooks }: GitCallOptions = {},
): Promise<Set<string>> => {
  const prefix = 'refs/heads/';

  try {
    const { stdout } = await execa(
      'git',
      gitArgs(
        ['ls-remote', '--heads', 'origin', ...branches.map((branch) => `${prefix}${branch}`)],
        skipHooks,
      ),
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
  { cancelSignal, skipHooks }: GitCallOptions = {},
) => {
  try {
    await execa(
      'git',
      gitArgs(
        [
          'fetch',
          'origin',
          ...branches.map((branch) => `+refs/heads/${branch}:refs/remotes/origin/${branch}`),
        ],
        skipHooks,
      ),
      { cancelSignal, env: noPromptEnv },
    );
  } catch (error) {
    throw new Error(`Failed to fetch from origin: ${(error as Error).message}`);
  }
};

export const isAncestor = async (
  ancestor: string,
  descendant: string,
  { cancelSignal, skipHooks }: GitCallOptions = {},
) => {
  const result = await execa(
    'git',
    gitArgs(['merge-base', '--is-ancestor', ancestor, descendant], skipHooks),
    { reject: false, cancelSignal },
  );

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

const countRevisionsStrict = async (
  args: string[],
  { skipHooks }: GitCallOptions = {},
): Promise<number> => {
  try {
    const { stdout } = await execa('git', gitArgs(['rev-list', '--count', ...args], skipHooks));
    return Number(stdout.trim());
  } catch (error) {
    throw new Error(
      `Failed to count commits with \`git rev-list --count ${args.join(' ')}\`: ${(error as Error).message}`,
    );
  }
};

export const countCommitsMissingLocally = (branch: string) =>
  countRevisionsStrict([`refs/heads/${branch}..refs/remotes/origin/${branch}`]);

// Commits that are only rebased copies of the remote's (same patch) don't count as local-only.
export const countLocalOnlyCommits = (
  remoteSha: string,
  localSha: string,
  options: GitCallOptions = {},
) => countRevisionsStrict(['--cherry-pick', '--right-only', `${remoteSha}...${localSha}`], options);

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

export const getGitVersion = async () => {
  const result = await execa('git', ['version'], { reject: false });

  if (result.failed || result.exitCode !== 0) {
    throw new Error('Could not run git. Install git and make sure it is on your PATH, then rerun.');
  }

  const [, major = '0', minor = '0'] = result.stdout.match(/(\d+)\.(\d+)/) ?? [];

  return { major: Number(major), minor: Number(minor) };
};

// Resolved with realpath so it matches the paths `git worktree list` prints.
export const getGitCommonDir = async () => {
  const result = await execa('git', ['rev-parse', '--git-common-dir'], { reject: false });

  if (result.failed || result.exitCode !== 0) {
    throw new Error('Not inside a git repository. Run this from your project checkout.');
  }

  return realpath(path.resolve(result.stdout.trim()));
};

export const createBranchAt = async (
  branch: string,
  startPoint: string,
  { cancelSignal, skipHooks }: GitCallOptions = {},
) => {
  try {
    await execa('git', gitArgs(['branch', branch, startPoint], skipHooks), { cancelSignal });
  } catch (error) {
    throw new Error(`Failed to create branch ${branch}: ${(error as Error).message}`);
  }
};

export const listLocalBranches = async (
  prefix: string,
  { skipHooks }: GitCallOptions = {},
): Promise<string[]> => {
  const { stdout } = await execa(
    'git',
    gitArgs(['for-each-ref', '--format=%(refname:short)', `refs/heads/${prefix}`], skipHooks),
  );

  return stdout.split('\n').filter(Boolean);
};

export const deleteBranchesQuietly = async (
  branches: string[],
  { skipHooks }: GitCallOptions = {},
) => {
  if (branches.length === 0) return;
  await execa('git', gitArgs(['branch', '-D', ...branches], skipHooks), { reject: false });
};

// Falls back to the plain merge base when the upstream reflog no longer knows the fork point.
export const getForkPoint = async (
  upstream: string,
  commit: string,
  { cancelSignal, skipHooks }: GitCallOptions = {},
) => {
  const forkPoint = await execa(
    'git',
    gitArgs(['merge-base', '--fork-point', upstream, commit], skipHooks),
    { reject: false, cancelSignal },
  );

  if (forkPoint.exitCode === 0) return forkPoint.stdout.trim();

  try {
    const { stdout } = await execa('git', gitArgs(['merge-base', upstream, commit], skipHooks), {
      cancelSignal,
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to find where ${commit} left ${upstream}: ${(error as Error).message}`);
  }
};

// Replay only reports refs/heads/* tips, and never updates the ref itself.
export const replayOnto = async (
  base: string,
  forkPoint: string,
  branch: string,
  { cancelSignal, skipHooks }: GitCallOptions = {},
): Promise<string | undefined> => {
  const result = await execa(
    'git',
    gitArgs(['replay', '--onto', base, `${forkPoint}..refs/heads/${branch}`], skipHooks),
    { reject: false, cancelSignal },
  );

  if (result.exitCode !== 0) return undefined;

  const update = result.stdout
    .split('\n')
    .map((line) => line.split(' '))
    .find(([command, ref]) => command === 'update' && ref === `refs/heads/${branch}`);

  return update?.[2];
};

export const listWorktreePaths = async ({ skipHooks }: GitCallOptions = {}) => {
  const { stdout } = await execa('git', gitArgs(['worktree', 'list', '--porcelain'], skipHooks));
  const prefix = 'worktree ';

  return stdout
    .split('\n')
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
};

export const addDetachedWorktree = async (
  dir: string,
  commit: string,
  { cancelSignal, skipHooks }: GitCallOptions = {},
) => {
  try {
    await execa('git', gitArgs(['worktree', 'add', '--detach', dir, commit], skipHooks), {
      cancelSignal,
    });
  } catch (error) {
    throw new Error(`Failed to create a worktree at ${dir}: ${(error as Error).message}`);
  }
};

export const rebaseWorktreeOnto = async (
  dir: string,
  base: string,
  upstream: string,
  { cancelSignal, skipHooks }: GitCallOptions = {},
) => {
  await execa('git', gitArgs(['-C', dir, 'rebase', '--onto', base, upstream], skipHooks), {
    cancelSignal,
    env: noPromptEnv,
  });

  const { stdout } = await execa('git', gitArgs(['-C', dir, 'rev-parse', 'HEAD'], skipHooks), {
    cancelSignal,
  });
  return stdout.trim();
};

export const abortWorktreeRebase = async (dir: string, { skipHooks }: GitCallOptions = {}) => {
  await execa('git', gitArgs(['-C', dir, 'rebase', '--abort'], skipHooks), { reject: false });
};

export const removeWorktree = async (dir: string, { skipHooks }: GitCallOptions = {}) => {
  await execa('git', gitArgs(['worktree', 'remove', '--force', dir], skipHooks), {
    reject: false,
  });
};

export const pruneWorktrees = async ({ skipHooks }: GitCallOptions = {}) => {
  await execa('git', gitArgs(['worktree', 'prune'], skipHooks), { reject: false });
};

type LeasedUpdate = { branch: string; sha: string; expectedSha: string };

type PushRefResult = { flag: string; summary: string };

// One lease per ref; --porcelain prints `<flag>\t<from>:<to>\t<summary>` for each of them.
export const pushWithLeases = async (
  updates: LeasedUpdate[],
  { atomic, cancelSignal, skipHooks }: GitCallOptions & { atomic?: boolean } = {},
) => {
  const result = await execa(
    'git',
    gitArgs(
      [
        'push',
        '--porcelain',
        '--no-verify',
        ...(atomic ? ['--atomic'] : []),
        ...updates.map(
          ({ branch, expectedSha }) => `--force-with-lease=refs/heads/${branch}:${expectedSha}`,
        ),
        'origin',
        ...updates.map(({ branch, sha }) => `${sha}:refs/heads/${branch}`),
      ],
      skipHooks,
    ),
    { reject: false, cancelSignal, env: noPromptEnv },
  );

  const refs = new Map<string, PushRefResult>();
  const prefix = 'refs/heads/';

  for (const line of String(result.stdout ?? '').split('\n')) {
    const [flag, refspec, summary] = line.split('\t');
    const destination = refspec?.split(':')[1];

    if (flag === undefined || summary === undefined || !destination?.startsWith(prefix)) continue;
    refs.set(destination.slice(prefix.length), { flag, summary });
  }

  return { ok: result.exitCode === 0, refs, stderr: String(result.stderr ?? '').trim() };
};
