import { getRemoteOriginUrl } from '@/domains/git/git.service.js';
import { parseRemote } from '@/infra/git/remote.js';

export const createMergeRequestUrl = ({
  remoteOriginUrl,
  sourceBranch,
  targetBranch,
}: {
  remoteOriginUrl: string;
  sourceBranch: string;
  targetBranch: string;
}) => {
  const remote = parseRemote(remoteOriginUrl);
  const baseUrl = remote
    ? `https://${remote.host}/${remote.path}`
    : remoteOriginUrl.replace(/\.git$/, '');
  const mergeRequestUrl = `${baseUrl}/-/merge_requests/new?merge_request[source_branch]=${sourceBranch}&merge_request[target_branch]=${targetBranch}`;
  return mergeRequestUrl;
};

export const isGitLabProject = async (): Promise<{ isGitlab: boolean; url: string | null }> => {
  const url = await getRemoteOriginUrl();
  if (!url) return { isGitlab: false, url: null };

  const remote = parseRemote(url);
  if (!remote) return { isGitlab: false, url: null };

  return { isGitlab: remote.host === 'gitlab.com', url };
};
