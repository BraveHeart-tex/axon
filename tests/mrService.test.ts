import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRemoteOriginUrl } from '@/domains/git/git.service.js';
import { createMergeRequestUrl, isGitLabProject } from '@/domains/mr/mr.service.js';

vi.mock('@/domains/git/git.service.js', () => ({
  getRemoteOriginUrl: vi.fn(),
}));

const mockedGetRemoteOriginUrl = vi.mocked(getRemoteOriginUrl);

describe('merge request service helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMergeRequestUrl', () => {
    it('strips a .git suffix and includes source and target branch query params', () => {
      expect(
        createMergeRequestUrl({
          remoteOriginUrl: 'https://gitlab.com/acme/axon.git',
          sourceBranch: 'release/ORD-1325',
          targetBranch: 'main',
        }),
      ).toBe(
        'https://gitlab.com/acme/axon/-/merge_requests/new?merge_request[source_branch]=release/ORD-1325&merge_request[target_branch]=main',
      );
    });
  });

  describe('isGitLabProject', () => {
    it('detects gitlab.com remotes', async () => {
      mockedGetRemoteOriginUrl.mockResolvedValueOnce('https://gitlab.com/acme/axon.git');

      await expect(isGitLabProject()).resolves.toEqual({
        isGitlab: true,
        url: 'https://gitlab.com/acme/axon.git',
      });
    });

    it('returns false for non-GitLab remotes', async () => {
      mockedGetRemoteOriginUrl.mockResolvedValueOnce('https://github.com/acme/axon.git');

      await expect(isGitLabProject()).resolves.toEqual({
        isGitlab: false,
        url: 'https://github.com/acme/axon.git',
      });
    });

    it('returns false with no url for empty or invalid remotes', async () => {
      mockedGetRemoteOriginUrl.mockResolvedValueOnce('');
      await expect(isGitLabProject()).resolves.toEqual({ isGitlab: false, url: null });

      mockedGetRemoteOriginUrl.mockResolvedValueOnce('git@gitlab.com:acme/axon.git');
      await expect(isGitLabProject()).resolves.toEqual({ isGitlab: false, url: null });
    });
  });
});
