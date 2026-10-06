import type { FlowSettings } from '@/domains/project/project.types.js';

type SyncGuardrail = 'release-branch-off-main' | 'feature-branch-onto-main';

export const findSyncGuardrail = (
  sourceBranch: string,
  targetBranch: string,
  flow?: FlowSettings,
): SyncGuardrail | undefined => {
  const isReleaseBranch = sourceBranch.startsWith(
    flow?.name === 'gitflow' ? flow.releasePrefix : 'release/',
  );
  const isMainOrMaster =
    targetBranch === (flow?.mainBranch ?? 'main') ||
    ((!flow || flow.mainBranch === 'main') && targetBranch === 'master');

  if (isReleaseBranch && !isMainOrMaster) return 'release-branch-off-main';
  if (!isReleaseBranch && isMainOrMaster) return 'feature-branch-onto-main';

  return undefined;
};
