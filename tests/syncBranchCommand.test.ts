import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncBranchCommand } from '@/commands/syncBranch.js';
import { runSyncBranchFlow } from '@/domains/branch/syncBranch.flow.js';
import { runSyncMineFlow } from '@/domains/branch/syncMine.flow.js';
import { logger } from '@/infra/logger.js';

vi.mock('@/domains/branch/syncBranch.flow.js', () => ({
  runSyncBranchFlow: vi.fn(),
}));

vi.mock('@/domains/branch/syncMine.flow.js', () => ({
  runSyncMineFlow: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedRunSyncBranchFlow = vi.mocked(runSyncBranchFlow);
const mockedRunSyncMineFlow = vi.mocked(runSyncMineFlow);

describe('syncBranchCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('rejects passing a target branch together with --mine', async () => {
    await syncBranchCommand('develop', { mine: true });

    expect(logger.error).toHaveBeenCalledWith('Cannot pass a target branch together with --mine.');
    expect(process.exitCode).toBe(1);
    expect(mockedRunSyncBranchFlow).not.toHaveBeenCalled();
    expect(mockedRunSyncMineFlow).not.toHaveBeenCalled();
  });

  it('runs the mine flow when --mine is set without a target', async () => {
    await syncBranchCommand(undefined, { mine: true, yes: true });

    expect(mockedRunSyncMineFlow).toHaveBeenCalledWith({
      yes: true,
      concurrency: 4,
      keepWorktrees: false,
    });
    expect(mockedRunSyncBranchFlow).not.toHaveBeenCalled();
  });

  it('passes --concurrency and --keep-worktrees to the mine flow', async () => {
    await syncBranchCommand(undefined, { mine: true, concurrency: '2', keepWorktrees: true });

    expect(mockedRunSyncMineFlow).toHaveBeenCalledWith({
      yes: false,
      concurrency: 2,
      keepWorktrees: true,
    });
  });

  it.each(['0', '-1', '1.5', 'four'])('rejects --concurrency %s', async (concurrency) => {
    await syncBranchCommand(undefined, { mine: true, concurrency });

    expect(logger.error).toHaveBeenCalledWith('--concurrency must be a positive integer.');
    expect(process.exitCode).toBe(1);
    expect(mockedRunSyncMineFlow).not.toHaveBeenCalled();
  });

  it.each([{ concurrency: '2' }, { keepWorktrees: true }])(
    'rejects %o without --mine',
    async (options) => {
      await syncBranchCommand(undefined, options);

      expect(logger.error).toHaveBeenCalledWith(
        '--concurrency and --keep-worktrees only work together with --mine.',
      );
      expect(process.exitCode).toBe(1);
      expect(mockedRunSyncBranchFlow).not.toHaveBeenCalled();
    },
  );

  it('runs the single-branch flow when --mine is not set', async () => {
    await syncBranchCommand('develop', {});

    expect(mockedRunSyncBranchFlow).toHaveBeenCalledWith('develop');
    expect(mockedRunSyncMineFlow).not.toHaveBeenCalled();
  });
});
