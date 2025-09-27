import inquirer from 'inquirer';
import { setApiKey, getApiKey, deleteApiKey, listApiKeys } from '../utils/config.js';

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
    if (keys.length === 0) console.log('❌ No keys stored yet.');
    else console.log('🔑 Stored keys:', keys.join(', '));
    return;
  }

  const { name } = await inquirer.prompt<{ name: string }>([
    { type: 'input', name: 'name', message: 'Enter a name for the key:' },
  ]);

  if (action === 'set') {
    const { key } = await inquirer.prompt<{ key: string }>([
      { type: 'password', name: 'key', message: `Enter API key for "${name}":` },
    ]);
    await setApiKey(name, key);
    console.log(`✅ Key "${name}" saved securely.`);
  } else if (action === 'view') {
    const key = await getApiKey(name);
    if (key) console.log(`🔑 Key for "${name}": ${key}`);
    else console.log(`❌ No key found for "${name}".`);
  } else if (action === 'delete') {
    await deleteApiKey(name);
    console.log(`🗑️ Key "${name}" deleted.`);
  }
};
