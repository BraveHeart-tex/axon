import inquirer from 'inquirer';
import ora, { Ora } from 'ora';

import { getApiKey, setApiKey } from '../config/apiKeyConfig.js';
import { CREDENTIAL_KEYS } from '../constants/config.js';
import { getCommitMessagePrompt } from '../domains/ai/ai.prompts.js';
import { streamAiResponse } from '../domains/ai/ai.service.js';
import {
  getCurrentBranchName,
  getStagedChangesDiff,
  inferJiraScopeFromBranch,
  inferScopeTypeFromBranch,
} from '../domains/git/git.service.js';
import { logger } from '../utils/logger.js';

export const generateAICommit = async () => {
  let spinner: Ora | null = null;

  try {
    let aiApiKey = await getApiKey(CREDENTIAL_KEYS.AI);
    if (!aiApiKey) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: 'Enter your Groq API key:',
          mask: '*',
          validate: (input) => (input.trim().length > 0 ? true : 'API key cannot be empty.'),
        },
      ]);

      await setApiKey(CREDENTIAL_KEYS.AI, key);
      aiApiKey = key.trim();
      logger.info('AI API key set successfully.');
    }

    const stagedChangesDiff = await getStagedChangesDiff();
    if (!stagedChangesDiff) {
      logger.error('No staged changes found.');
      return;
    }

    spinner = ora('🤖 Generating commit message with AI...').start();

    let fullMessage = '';
    const branchName = await getCurrentBranchName();
    const inferredScope = inferJiraScopeFromBranch(branchName);
    const inferredScopeType = inferScopeTypeFromBranch(branchName);

    await streamAiResponse({
      apiKey: aiApiKey as string,
      prompt: getCommitMessagePrompt({ diff: stagedChangesDiff, inferredScope, inferredScopeType }),
      onChunk: (chunk) => {
        fullMessage += chunk;
      },
    });

    fullMessage = fullMessage.replace(/\s+/g, ' ').split('\n')[0].trim();

    spinner.stop();
    logger.info('\n✨ Suggested commit message:\n', false);
    logger.info(fullMessage, false);
  } catch (error) {
    if (spinner) {
      spinner.fail(String(error));
    }
    logger.error(
      `An error occurred while generating commit message: ${error instanceof Error ? error.message : error}`,
    );
  }
};
