import {
  findRemoteOriginUrl,
  getGitConfigValue,
  isInsideGitRepository,
} from '@/domains/git/git.service.js';
import { parseRemote } from '@/infra/git/remote.js';

import { PROJECT_ID_GIT_CONFIG_KEY } from './project.constants.js';

export interface ProjectIdentity {
  insideRepo: boolean;
  id: string | null;
  override: string;
  originUrl: string;
  remoteKey: string | null;
}

export const toRemoteKey = (url: string): string | null => {
  const remote = parseRemote(url);
  return remote ? `${remote.host}/${remote.path}` : null;
};

export const toProjectSlug = (id: string) =>
  id.replaceAll('/', '__').replace(/[^A-Za-z0-9._-]/g, '');

export const resolveProjectIdentity = async (): Promise<ProjectIdentity> => {
  if (!(await isInsideGitRepository())) {
    return { insideRepo: false, id: null, override: '', originUrl: '', remoteKey: null };
  }

  const [override, originUrl] = await Promise.all([
    getGitConfigValue(PROJECT_ID_GIT_CONFIG_KEY),
    findRemoteOriginUrl(),
  ]);
  const remoteKey = originUrl ? toRemoteKey(originUrl) : null;

  return { insideRepo: true, id: override || remoteKey, override, originUrl, remoteKey };
};
