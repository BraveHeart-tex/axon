import { getRemoteOriginUrl } from '@/domains/git/git.service.js';

export const createMergeRequestUrl = ({
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

export const isGitLabProject = async (): Promise<{ isGitlab: boolean; url: string | null }> => {
  const url = await getRemoteOriginUrl();
  if (!url) return { isGitlab: false, url: null };

  try {
    const hostname = new URL(url).hostname;
    return { isGitlab: hostname === 'gitlab.com', url };
  } catch {
    return { isGitlab: false, url: null };
  }
};
