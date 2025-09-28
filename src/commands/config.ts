import inquirer from 'inquirer';
import { setApiKey, getApiKey, deleteApiKey, listApiKeys } from '../utils/config.js';
import { CREDENTIAL_KEYS, CredentialKey } from '../constants/config.js';
import { logger } from '../utils/logger.js';

export const configureApiKey = async () => {
  const { action } = await inquirer.prompt<{ action: 'set' | 'view' | 'delete' | 'list' }>([
    {
      type: 'list',
      name: 'action',
      message: 'What do you want to do?',
      choices: ['set', 'view', 'delete', 'list'],
    },
  ]);

  if (action === 'list') {
    const keys = listApiKeys();
    if (keys.length === 0) logger.info('❌ No keys stored yet.');
    else logger.info(`🔑 Stored keys: ${keys.join(', ')}`);
    return;
  }

  const { name } = await inquirer.prompt<{ name: CredentialKey }>([
    {
      type: 'list',
      name: 'name',
      message: 'Enter a name for the key:',
      choices: Object.values(CREDENTIAL_KEYS),
    },
  ]);

  if (action === 'set') {
    const { key } = await inquirer.prompt<{ key: string }>([
      { type: 'password', name: 'key', message: `Enter API key for "${name}":` },
    ]);
    await setApiKey(name, key);
    logger.info(`✅ Key "${name}" saved securely.`);
  } else if (action === 'view') {
    const key = await getApiKey(name);
    if (key) logger.info(`🔑 Key for "${name}": ${key}`);
    else logger.info(`❌ No key found for "${name}".`);
  } else if (action === 'delete') {
    await deleteApiKey(name);
    logger.info(`🗑️ Key "${name}" deleted.`);
  }
};
