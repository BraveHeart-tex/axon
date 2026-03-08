import { deleteApiKey, getApiKey, listApiKeys, setApiKey } from '@/config/apiKeyConfig.js';
import { CredentialKey } from '@/domains/config/config.types.js';
import { AxonConfig, readConfig, writeConfig } from '@/infra/store/configStore.js';

export type ConfigKey = keyof AxonConfig;

export const ConfigManager = {
  get: (key: ConfigKey): string => readConfig()[key],

  set: (key: ConfigKey, value: string) => {
    writeConfig({ [key]: value });
  },

  getSecret: async (name: CredentialKey): Promise<string | null> => await getApiKey(name),

  setSecret: async (name: CredentialKey, key: string) => {
    await setApiKey(name, key);
  },

  deleteSecret: async (name: CredentialKey) => {
    await deleteApiKey(name);
  },

  listSecrets: (): string[] => listApiKeys(),

  /**
   * Gets a config value or prompts the user if missing.
   */
  getOrPrompt: async (key: ConfigKey, promptFn: () => Promise<string>): Promise<string> => {
    const value = readConfig()[key];
    if (value) return value;

    const newValue = await promptFn();
    writeConfig({ [key]: newValue });
    return newValue;
  },

  /**
   * Gets a secret or prompts the user if missing.
   */
  getSecretOrPrompt: async (name: string, promptFn: () => Promise<string>): Promise<string> => {
    const secret = await getApiKey(name as CredentialKey);
    if (secret) return secret;

    const newSecret = await promptFn();
    await setApiKey(name as CredentialKey, newSecret);
    return newSecret;
  },
};
