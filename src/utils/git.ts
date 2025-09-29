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

export const getRecentCommitsForDevelop = async (
  limit: number = 50,
): Promise<{ name: string; value: string }[]> => {
  const { stdout } = await execa('git', [
    'log',
    '--pretty=format:%h|%an|%ad|%s',
    '-n',
    String(limit),
    'develop',
  ]);

  return stdout.split('\n').map((line) => {
    const [hash, author, date, ...messageParts] = line.split('|');
    const message = messageParts.join('|');
    return {
      name: `${hash} | ${author} | ${date} | ${message}`,
      value: hash,
    };
  });
};

export const cherryPickCommit = async (commitHash: string) => {
  return execa('git', ['cherry-pick', commitHash], { stdio: 'inherit' });
};
