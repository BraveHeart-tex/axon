import fs from 'node:fs';
import path from 'node:path';

import ora, { Ora } from 'ora';

import { getApiKey } from '@/config/apiKeyConfig.js';
import { getReviewPrompt } from '@/domains/ai/ai.prompts.js';
import { streamAiResponse } from '@/domains/ai/ai.service.js';
import { CREDENTIAL_KEYS } from '@/domains/config/config.constants.js';
import { getStagedChangesDiff } from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

export const reviewAiCommand = async (diffContent: string) => {
  let spinner: Ora | null = null;
  try {
    const aiApiKey = await getApiKey(CREDENTIAL_KEYS.AI);
    // TODO: Trigger a set-command here to set the ai-key
    if (!aiApiKey) {
      logger.error('Groq API key is required to generate a commit message.');
      return;
    }

    const stagedChangesDiff = diffContent || (await getStagedChangesDiff());
    if (!stagedChangesDiff) {
      logger.error('No staged changes found.');
      return;
    }

    spinner = ora('🤖 Generating code review with AI...').start();

    const outFile = path.resolve(process.cwd(), 'ai-review.md');
    const fileStream = fs.createWriteStream(outFile, { flags: 'w' });

    try {
      await streamAiResponse({
        apiKey: aiApiKey,
        prompt: getReviewPrompt(stagedChangesDiff),
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
