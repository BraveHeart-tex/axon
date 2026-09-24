type SyncGuardrail = 'release-branch-off-main' | 'feature-branch-onto-main';

export const findSyncGuardrail = (
  sourceBranch: string,
  targetBranch: string,
): SyncGuardrail | undefined => {
  const isReleaseBranch = sourceBranch.startsWith('release/');
  const isMainOrMaster = targetBranch === 'main' || targetBranch === 'master';

  if (isReleaseBranch && !isMainOrMaster) return 'release-branch-off-main';
  if (!isReleaseBranch && isMainOrMaster) return 'feature-branch-onto-main';

  return undefined;
};
