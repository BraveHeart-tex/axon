import { link, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';

interface LockHeldError extends Error {
  lockHolderPid: number;
}

export const createLockHeldError = (pid: number): LockHeldError => {
  const error = new Error(
    `Another sync is running (pid ${pid}). Wait for it to finish, then rerun.`,
  ) as LockHeldError;
  error.lockHolderPid = pid;
  return error;
};

export const isLockHeldError = (error: unknown): error is LockHeldError =>
  error instanceof Error && typeof (error as Partial<LockHeldError>).lockHolderPid === 'number';

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

// EPERM means the process exists but belongs to someone else, so it still holds the lock.
const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === 'EPERM';
  }
};

const readLock = (file: string) => readFile(file, 'utf8').catch(() => '');

const ownContent = () => `${process.pid}\n`;

const isOwnLock = async (file: string, ino: number) => {
  try {
    return (await readLock(file)) === ownContent() && (await stat(file)).ino === ino;
  } catch {
    return false;
  }
};

// Linked into place from a temp file, so the lock never exists without its PID.
const tryCreateLock = async (file: string) => {
  const temp = `${file}.${process.pid}.tmp`;

  try {
    await writeFile(temp, ownContent());
    await link(temp, file);
    return true;
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return false;

    throw new Error(
      `Could not create the lock at ${file}: ${(error as Error).message}. Check that the folder is writable, then rerun.`,
    );
  } finally {
    await rm(temp, { force: true });
  }
};

// Moved aside before deleting, so a run that took the lock in the meantime gets it back.
const clearStaleLock = async (file: string, staleContent: string) => {
  const aside = `${file}.${process.pid}.stale`;

  try {
    await rename(file, aside);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }

  try {
    if ((await readLock(aside)) !== staleContent) await link(aside, file).catch(() => undefined);
  } finally {
    await rm(aside, { force: true });
  }
};

// Moved aside before deleting, so a lock another run holds by now is put back, not removed.
const releaseOwnLock = async (file: string, ino: number) => {
  const aside = `${file}.${process.pid}.release`;

  try {
    await rename(file, aside);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }

  try {
    if (!(await isOwnLock(aside, ino))) await link(aside, file).catch(() => undefined);
  } finally {
    await rm(aside, { force: true });
  }
};

const createLock = (file: string, ino: number) => {
  let released = false;

  return {
    isHeld: () => (released ? Promise.resolve(false) : isOwnLock(file, ino)),
    release: async () => {
      if (released) return;
      released = true;
      await releaseOwnLock(file, ino);
    },
  };
};

export type PidLock = ReturnType<typeof createLock>;

export const acquirePidLock = async (file: string) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await tryCreateLock(file)) return createLock(file, (await stat(file)).ino);

    const content = await readLock(file);
    const pid = Number(content.trim());
    if (pid > 0 && isRunning(pid)) throw createLockHeldError(pid);

    await clearStaleLock(file, content);
  }

  throw new Error(
    `Could not take the lock at ${file}. Delete it if no sync is running, then rerun.`,
  );
};
