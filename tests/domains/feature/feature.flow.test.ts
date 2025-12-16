import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { runFeatureFlow } from '@/domains/feature/feature.service.js';

vi.mock('@/domains/git/git.service.js', () => ({
  checkoutAndCreateBranch: vi.fn(),
}));

vi.mock('@/domains/mode/mode.service.js', () => ({
  getCliModeConfig: vi.fn(),
}));

vi.mock('@/domains/feature/flows/resolveIssueKey.flow.js', () => ({
  resolveIssueKey: vi.fn(),
}));

vi.mock('@/domains/feature/flows/resolveBranchMeta.flow.js', () => ({
  resolveBranchMeta: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { resolveBranchMeta } from '@/domains/feature/flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from '@/domains/feature/flows/resolveIssueKey.flow.js';
import { checkoutAndCreateBranch } from '@/domains/git/git.service.js';
import { getCliModeConfig } from '@/domains/mode/mode.service.js';
import { logger } from '@/infra/logger.js';

describe('runFeatureFlow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should create a feature branch with slug', async () => {
    (getCliModeConfig as Mock).mockReturnValue('JIRA');
    (resolveIssueKey as Mock).mockResolvedValue('ORD-123');
    (resolveBranchMeta as Mock).mockResolvedValue({
      commitLabel: 'feature',
      slug: 'add-logging',
    });

    await runFeatureFlow();

    expect(resolveIssueKey).toHaveBeenCalledWith('JIRA');
    expect(resolveBranchMeta).toHaveBeenCalledWith('ORD-123');

    expect(checkoutAndCreateBranch).toHaveBeenCalledWith('develop', 'feature/ORD-123-add-logging');
  });

  it('should create a branch without slug', async () => {
    (getCliModeConfig as Mock).mockReturnValue('JIRA');
    (resolveIssueKey as Mock).mockResolvedValue('ORD-456');
    (resolveBranchMeta as Mock).mockResolvedValue({
      commitLabel: 'feature',
      slug: '',
    });

    await runFeatureFlow();

    expect(checkoutAndCreateBranch).toHaveBeenCalledWith('develop', 'feature/ORD-456');
  });

  it('should log error when git operation fails', async () => {
    (getCliModeConfig as Mock).mockReturnValue('JIRA');
    (resolveIssueKey as Mock).mockResolvedValue('ORD-999');
    (resolveBranchMeta as Mock).mockResolvedValue({
      commitLabel: 'feature',
      slug: 'fail',
    });

    (checkoutAndCreateBranch as Mock).mockRejectedValue(new Error('Git exploded'));

    await runFeatureFlow();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Git operation failed'));
  });
});
