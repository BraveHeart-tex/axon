import chalk from 'chalk';
import { execa } from 'execa';

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
    '--',
    ':!*.lock',
    ':!*.svg',
    ':!*.png',
    ':!*.jpg',
    ':!*.jpeg',
  ]);
  return stdout;
};

export interface RecentCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

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
    author ? `--author=${author}` : '',
  ]);

  if (stdout === '') {
    return [];
  }

  return stdout.split('\n').map((line) => {
    const [hash, author, date, ...messageParts] = line.split('|');

    return {
      hash,
      author,
      date,
      message: messageParts.join('|'),
    };
  });
};

export const formatCommitChoice = (commit: RecentCommit) => {
  const hash = chalk.yellow(commit.hash);
  const scope = chalk.green(`[${getScopeFromCommitMessage(commit.message)}]`);
  const message = commit.message.length > 100 ? `${commit.message.slice(0, 100)}…` : commit.message;

  const meta = chalk.gray(`${commit.author} • ${commit.date}`);

  return {
    value: commit.hash,
    short: commit.hash,
    name: `${hash}  ${scope} ${message}\n     ${meta}`,
  };
};

export const cherryPickCommit = async (commitHash: string) => {
  return execa('git', ['cherry-pick', commitHash], { stdio: 'inherit' });
};

export const getCurrentBranchName = async () => {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout;
};

export const fetchRemote = async (branchName: string) => {
  await execa('git', ['fetch', branchName], { stdio: 'inherit' });
};

export const inferJiraScopeFromBranch = (branch: string) => {
  const JIRA_REGEX = /\b(?:FE|ORD|DIS|PE|PRD|MEM|MOD)-\d+\b/;

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

export const parseGitLog = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...msgParts] = line.trim().split(' ');
      return {
        hash,
        message: msgParts.join(' '),
      };
    });

export const getScopeFromCommitMessage = (commitMessage: string): string => {
  const JIRA_REGEX = /\b(?:FE|ORD|DIS|PE|PRD|MEM|MOD)-\d+\b/;
  const match = commitMessage.match(JIRA_REGEX);
  const jiraScope = match?.[0] ?? '';

  if (jiraScope) return jiraScope;

  const fallbackScope = commitMessage.split(':')[0]?.trim() ?? '';
  return fallbackScope;
};
