import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquirePidLock, isLockHeldError } from '@/infra/pidLock.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const mockedRename = vi.mocked(rename);

let dir: string;
let file: string;

const deadPid = async () => (await execa('node', ['-e', ''])).pid as number;

describe('acquirePidLock', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await mkdtemp(path.join(tmpdir(), 'axon-lock-'));
    file = path.join(dir, 'axon-sync.lock');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the PID, leaves no temp file behind and removes the lock on release', async () => {
    const lock = await acquirePidLock(file);

    expect(await readFile(file, 'utf8')).toBe(`${process.pid}\n`);
    expect(await readdir(dir)).toEqual(['axon-sync.lock']);

    await lock.release();

    expect(existsSync(file)).toBe(false);
  });

  it('refuses a lock held by a running process', async () => {
    await writeFile(file, `${process.pid}\n`);

    await expect(acquirePidLock(file)).rejects.toSatisfy(isLockHeldError);
    expect(await readFile(file, 'utf8')).toBe(`${process.pid}\n`);
  });

  it.each([
    ['a dead PID', async () => `${await deadPid()}\n`],
    ['no PID', async () => ''],
  ])('clears a lock with %s', async (_label, content) => {
    await writeFile(file, await content());

    await acquirePidLock(file);

    expect(await readFile(file, 'utf8')).toBe(`${process.pid}\n`);
    expect(await readdir(dir)).toEqual(['axon-sync.lock']);
  });

  it('gives the lock back to a run that took it while the stale one was being cleared', async () => {
    await writeFile(file, `${await deadPid()}\n`);
    const actualRename = mockedRename.getMockImplementation()!;
    mockedRename.mockImplementationOnce(async (from, to) => {
      await writeFile(file, `${process.pid}\n`);
      return actualRename(from, to);
    });

    await expect(acquirePidLock(file)).rejects.toSatisfy(isLockHeldError);
    expect(await readFile(file, 'utf8')).toBe(`${process.pid}\n`);
    expect(await readdir(dir)).toEqual(['axon-sync.lock']);
  });

  it('reports the lock held until it is released', async () => {
    const lock = await acquirePidLock(file);

    expect(await lock.isHeld()).toBe(true);

    await lock.release();

    expect(await lock.isHeld()).toBe(false);
  });

  it('reports the lock lost once another run replaced it', async () => {
    const lock = await acquirePidLock(file);
    // Written beside the old lock first, so the replacement can't reuse its inode.
    await writeFile(`${file}.other`, `${process.pid}\n`);
    await rename(`${file}.other`, file);

    expect(await lock.isHeld()).toBe(false);
  });

  it('keeps a lock another run took over when releasing', async () => {
    const lock = await acquirePidLock(file);
    await rm(file);
    await writeFile(file, '4242\n');

    await lock.release();

    expect(await readFile(file, 'utf8')).toBe('4242\n');
    expect(await readdir(dir)).toEqual(['axon-sync.lock']);
  });

  it('says what to check when the lock cannot be created', async () => {
    await expect(acquirePidLock(path.join(dir, 'missing', 'axon-sync.lock'))).rejects.toThrow(
      /Could not create the lock at .*Check that the folder is writable/,
    );
  });
});
