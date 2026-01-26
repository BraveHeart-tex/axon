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
    '-U3',
    '--',
    ':!**/*.lock',
    ':!**/*.svg',
    ':!**/*.png',
    ':!**/*.jpg',
    ':!**/*.jpeg',
    ':!**/*.map',
    ':!**/dist/**',
    ':!**/build/**',
  ]);

  if (!stdout.trim()) return '';

  const MAX_CHARS = 20_000;
  return stdout.length > MAX_CHARS ? stdout.slice(0, MAX_CHARS) + '\n…diff truncated' : stdout;
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
  const { stdout } = await execa('git', [
    'log',
    onlyUnmerged ? 'main..develop' : 'develop',
    '--pretty=format:%h|%an|%ad|%s',
    '--date=relative',
    '-n',
    String(limit),
    ...(author ? ['--author', author] : []),
  ]);

  if (stdout === '') {
    return [];
  }

  return formatCommits(stdout.split('\n'));
};

export const cherryPickCommit = async (commitHash: string) =>
  execa('git', ['cherry-pick', commitHash], { stdio: 'inherit' });

export const getCurrentBranchName = async () => {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout;
};

export const fetchRemote = async (branchName: string) => {
  await execa('git', ['fetch', branchName], { stdio: 'inherit' });
};

export const inferJiraScopeFromBranch = (branch: string) => {
  const scopeMatch = branch.match(JIRA_REGEX);
  if (!scopeMatch) return '';

  return scopeMatch ? scopeMatch[0] : '';
};

export const inferScopeTypeFromBranch = (branch: string) => {
  if (!branch.includes('/')) return '';
  const [scopeType] = branch.split('/');
  return scopeType;
};

export const getCommitsByGrep = async (jiraKey: string) => {
  const { stdout } = await execa('git', ['log', '--oneline', '--reverse', `--grep=${jiraKey}`]);

  return stdout;
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

export const createMergeRequestUrl = async ({
  remoteOriginUrl,
  sourceBranch,
  targetBranch,
}: {
  remoteOriginUrl: string;
  sourceBranch: string;
  targetBranch: string;
}) => {
  const baseUrl = remoteOriginUrl.replace(/\.git$/, '');
  const mergeRequestUrl = `${baseUrl}/-/merge_requests/new?merge_request[source_branch]=${sourceBranch}&merge_request[target_branch]=${targetBranch}`;
  return mergeRequestUrl;
};
