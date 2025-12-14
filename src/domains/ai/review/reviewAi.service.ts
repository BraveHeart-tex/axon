import fs from 'node:fs';
import path from 'node:path';

import ora, { Ora } from 'ora';

import { getApiKey } from '@/config/apiKeyConfig.js';
import { getReviewPrompt } from '@/domains/ai/ai.prompts.js';
import { streamAiResponse } from '@/domains/ai/ai.service.js';
import { CREDENTIAL_KEYS } from '@/domains/config/config.constants.js';
import { getStagedChangesDiff } from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

export const runReviewAiFlow = async (diffInput: string | null) => {
  let spinner: Ora | null = null;

  try {
    const apiKey = await getApiKey(CREDENTIAL_KEYS.AI);
    if (!apiKey) {
      logger.error('Groq API key is required to generate a code review.');
      return;
    }

    const diff = diffInput || (await getStagedChangesDiff());
    if (!diff) {
      logger.error('No diff found (inline, file, or staged changes).');
      return;
    }

    const outFile = path.resolve(process.cwd(), 'ai-review.md');
    const fileStream = fs.createWriteStream(outFile, { flags: 'w' });

    spinner = ora('🤖 Generating code review with AI...').start();

    try {
      await streamAiResponse({
        apiKey,
        prompt: getReviewPrompt(diff),
        onChunk: (chunk) => {
          fileStream.write(chunk);
        },
      });
    } finally {
      fileStream.end();
    }

    spinner.succeed(`AI review file saved to ${path.basename(outFile)}`);
  } catch (error) {
    if (spinner) spinner.fail('AI review failed.');
    logger.error(String(error));
  }
};
