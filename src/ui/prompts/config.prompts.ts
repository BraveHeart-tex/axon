import inquirer from 'inquirer';

import { CREDENTIAL_KEYS } from '@/domains/config/config.constants.js';
import { CredentialKey } from '@/domains/config/config.types.js';

export type ConfigAction = 'set' | 'view' | 'delete' | 'list';

export const promptConfigAction = () =>
  inquirer.prompt<{ action: ConfigAction }>([
    {
      type: 'list',
      name: 'action',
      message: 'What do you want to do?',
      choices: ['set', 'view', 'delete', 'list'],
    },
  ]);

export const promptCredentialName = () =>
  inquirer.prompt<{ name: CredentialKey }>([
    {
      type: 'list',
      name: 'name',
      message: 'Select credential:',
      choices: Object.values(CREDENTIAL_KEYS),
    },
  ]);

export const promptApiKey = (name: string) =>
  inquirer.prompt<{ key: string }>([
    {
      type: 'password',
      name: 'key',
      message: `Enter API key for "${name}":`,
    },
  ]);
