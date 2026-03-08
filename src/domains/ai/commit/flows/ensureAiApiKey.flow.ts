import { CREDENTIAL_KEYS } from '@/domains/config/config.constants.js';
import { ConfigManager } from '@/infra/config/configManager.js';
import { promptSecretValue } from '@/ui/prompts/config.prompts.js';

export const ensureAiApiKey = async (): Promise<string> =>
  ConfigManager.getSecretOrPrompt(CREDENTIAL_KEYS.AI, () =>
    promptSecretValue('Enter API key for AI:'),
  );
