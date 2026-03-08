import { logger } from '@/infra/logger.js';

import { confirmReleasePlan } from './flows/confirmReleasePlan.flow.js';
import { resolveReleaseInput } from './flows/resolveReleaseInput.flow.js';
import { executeRelease } from './release.executor.js';
import type { ReleaseOptions } from './release.types.js';

export const runReleaseFlow = async (options: ReleaseOptions): Promise<void> => {
  try {
    const input = await resolveReleaseInput(options);

    const confirmed = await confirmReleasePlan({
      branchTitle: input.branchTitle,
      commits: input.commits,
      recentCommits: input.recentCommits,
    });

    if (!confirmed) {
      logger.info('Release cancelled.');
      return;
    }

    await executeRelease({
      branchTitle: input.branchTitle,
      commits: input.commits,
      recentCommits: input.recentCommits,
    });
  } catch (err) {
    logger.error(`Release failed: ${(err as Error).message}`);
  }
};
