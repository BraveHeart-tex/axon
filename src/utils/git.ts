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
