import inquirer from 'inquirer';

import { getApiKey, setApiKey } from '../../../../config/apiKeyConfig.js';
import { logger } from '../../../../infra/logger.js';
import { CREDENTIAL_KEYS } from '../../../config/config.constants.js';

export const ensureAiApiKey = async (): Promise<string> => {
  const apiKey = await getApiKey(CREDENTIAL_KEYS.AI);

  if (apiKey) return apiKey;

  const { key } = await inquirer.prompt<{ key: string }>([
    {
      type: 'password',
      name: 'key',
      message: 'Enter your Groq API key:',
      mask: '*',
      validate: (input) => (input.trim().length > 0 ? true : 'API key cannot be empty.'),
    },
  ]);

  await setApiKey(CREDENTIAL_KEYS.AI, key.trim());
  logger.info('AI API key set successfully.');

  return key.trim();
};
