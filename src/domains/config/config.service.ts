import { deleteApiKey, getApiKey, listApiKeys, setApiKey } from '@/config/apiKeyConfig.js';
import { logger } from '@/infra/logger.js';

import { CredentialKey } from './config.types.js';

export const listCredentials = () => {
  const keys = listApiKeys();
  if (keys.length === 0) logger.info('No keys stored yet.');
  else logger.info(`Stored keys: ${keys.join(', ')}`);
};

export const setCredential = async (name: CredentialKey, key: string) => {
  await setApiKey(name, key);
  logger.info(`Key "${name}" saved securely.`);
};

export const viewCredential = async (name: CredentialKey) => {
  const key = await getApiKey(name);
  if (key) logger.info(`Key for "${name}": ${key}`);
  else logger.info(`No key found for "${name}".`);
};

export const deleteCredential = async (name: CredentialKey) => {
  await deleteApiKey(name);
  logger.info(`Key "${name}" deleted.`);
};
