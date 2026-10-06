import { isWorkingTreeDirty } from '@/domains/git/git.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { confirmReleasePlan } from '@/domains/release/flows/confirmReleasePlan.flow.js';
import { resolveReleaseInput } from '@/domains/release/flows/resolveReleaseInput.flow.js';
import { isReleaseAbortedError } from '@/domains/release/release.errors.js';
import { executeRelease } from '@/domains/release/release.executor.js';
import type { ReleaseOptions } from '@/domains/release/release.types.js';
import { logger } from '@/infra/logger.js';

export const runReleaseFlow = async (
  options: ReleaseOptions,
  context: ProjectContext,
): Promise<void> => {
  if (context.flow.name === 'classified') {
    logger.error(
      "axon release isn't used in the classified flow. MRs ship to main via the merge train.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    if (await isWorkingTreeDirty()) {
      logger.error('Working tree is dirty. Commit or stash first.');
      return;
    }

    const input = await resolveReleaseInput(options, context);

    const confirmed = await confirmReleasePlan(
      {
        branchTitle: input.branchTitle,
        commits: input.commits,
        recentCommits: input.recentCommits,
      },
      context.flow.mainBranch,
    );

    if (!confirmed) {
      logger.info('Release cancelled.');
      return;
    }

    await executeRelease(
      {
        branchTitle: input.branchTitle,
        commits: input.commits,
        recentCommits: input.recentCommits,
      },
      context.flow.mainBranch,
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      logger.info('Release cancelled.');
      return;
    }

    if (isReleaseAbortedError(err)) {
      logger.info(err.message);
      return;
    }

    logger.error(`Release failed: ${(err as Error).message}`);
  }
};
