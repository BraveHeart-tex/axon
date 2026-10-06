import { confirm, select } from '@inquirer/prompts';

import {
  abortRebase,
  autosquashInPlace,
  commitFixup,
  getCurrentBranchPushLease,
  listFixupTargets,
  pushHeadWithLease,
} from '@/domains/git/git.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { registerCancellation } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';

export const offerCommitFixup = async (context: ProjectContext): Promise<boolean> => {
  if (context.flow.name !== 'classified') return false;
  const commits = await listFixupTargets(context.flow.mainBranch);
  if (!commits.length) return false;
  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'New commit', value: 'new' },
      { name: 'Fix up an existing commit', value: 'fixup' },
    ],
  });
  if (action === 'new') return false;
  const sha = await select({
    message: 'Which commit should receive the fix?',
    choices: commits.map(({ sha, subject }) => ({
      name: `${sha.slice(0, 12)} ${subject}`,
      value: sha,
    })),
  });
  const subject = commits.find((commit) => commit.sha === sha)!.subject;
  logger.info(`Creating fixup for ${subject}`);
  await commitFixup(sha);
  if (!(await confirm({ message: `Squash into ${subject} and push now?`, default: false }))) {
    logger.info('Fixup saved - run axon sb to squash and rebase.');
    return true;
  }

  let rebase: Promise<void> | undefined;
  const cancellation = registerCancellation(async () => {
    if (rebase) {
      await rebase.catch(() => undefined);
      await abortRebase();
    }
  });
  try {
    logger.info('Checking origin before squashing');
    const { branch, expectedSha } = await getCurrentBranchPushLease({
      cancelSignal: cancellation.signal,
    });
    logger.info(`Squashing into ${subject}`);
    try {
      rebase = autosquashInPlace(`${sha}^`, { cancelSignal: cancellation.signal });
      await rebase;
    } catch (error) {
      await abortRebase();
      throw new Error(
        `Autosquash failed: ${(error as Error).message}. Fixup preserved - run axon sb to squash and rebase.`,
      );
    }
    rebase = undefined;
    logger.info('Pushing with --force-with-lease');
    await pushHeadWithLease(branch, expectedSha, { cancelSignal: cancellation.signal });
    logger.success('Squashed and pushed.');
    return true;
  } finally {
    cancellation.unregister();
  }
};
