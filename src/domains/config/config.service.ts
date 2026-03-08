import { ConfigManager } from '@/infra/config/configManager.js';
import { logger } from '@/infra/logger.js';

import { CredentialKey } from './config.types.js';

export const listCredentials = () => {
  const keys = ConfigManager.listSecrets();
  if (keys.length === 0) logger.info('No keys stored yet.');
  else logger.info(`Stored keys: ${keys.join(', ')}`);
};

export const setCredential = async (name: CredentialKey, key: string) => {
  await ConfigManager.setSecret(name, key);
  logger.info(`Key "${name}" saved securely.`);
};

export const viewCredential = async (name: CredentialKey) => {
  const key = await ConfigManager.getSecret(name);
  if (key) logger.info(`Key for "${name}": ${key}`);
  else logger.info(`No key found for "${name}".`);
};

export const deleteCredential = async (name: CredentialKey) => {
  await ConfigManager.deleteSecret(name);
  logger.info(`Key "${name}" deleted.`);
};
