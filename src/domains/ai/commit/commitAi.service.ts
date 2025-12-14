import ora, { Ora } from 'ora';

import { logger } from '@/infra/logger.js';

import { ensureAiApiKey } from './flows/ensureAiApiKey.flow.js';
import { generateCommitMessage } from './flows/generateCommitMessage.flow.js';
import { resolveCommitContext } from './flows/resolveCommitContext.flow.js';

export const runCommitAiFlow = async () => {
  let spinner: Ora | null = null;

  try {
    const apiKey = await ensureAiApiKey();
    const context = await resolveCommitContext();

    spinner = ora('🤖 Generating commit message with AI...').start();

    const message = await generateCommitMessage(apiKey, context);

    spinner.stop();

    logger.info('\n✨ Suggested commit message:\n', false);
    logger.info(message, false);
  } catch (error) {
    if (spinner) spinner.fail(String(error));
    logger.error(
      `An error occurred while generating commit message: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
};
