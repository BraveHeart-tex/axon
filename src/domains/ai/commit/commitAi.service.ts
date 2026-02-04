import ora, { Ora } from 'ora';

import { logger } from '@/infra/logger.js';

import { classifyCommit } from './flows/classifyCommit.flow.js';
import { ensureAiApiKey } from './flows/ensureAiApiKey.flow.js';
import { generateCommitMessage } from './flows/generateCommitMessage.flow.js';
import { resolveCommitContext } from './flows/resolveCommitContext.flow.js';

export const runCommitAiFlow = async () => {
  let spinner: Ora | null = null;

  try {
    const apiKey = await ensureAiApiKey();
    const context = await resolveCommitContext();

    spinner = ora('Analyzing changes...').start();
    const classification = await classifyCommit(apiKey, context);

    spinner.text = 'Generating commit message...';

    const message = await generateCommitMessage(apiKey, classification);

    spinner.stop();

    logger.info('\n✨ Suggested commit message:\n', false);
    logger.info(message, false);
  } catch (error) {
    if (spinner) spinner.fail(String(error));
    logger.error(`Commit AI failed: ${error instanceof Error ? error.message : error}`);
  }
};
