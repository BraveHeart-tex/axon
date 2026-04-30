import inquirer from 'inquirer';

import {
  CONFIG_SETTING_KEYS,
  CONFIG_SETTING_LABELS,
  CREDENTIAL_KEYS,
} from '@/domains/config/config.constants.js';
import { ConfigSettingKey, CredentialKey } from '@/domains/config/config.types.js';

export type ConfigAction = 'set' | 'view' | 'delete' | 'list';
export type ConfigTarget = 'setting' | 'credential';

export const promptConfigAction = () =>
  inquirer.prompt<{ action: ConfigAction }>([
    {
      type: 'list',
      name: 'action',
      message: 'What do you want to do?',
      choices: ['set', 'view', 'delete', 'list'],
    },
  ]);

export const promptConfigTarget = () =>
  inquirer.prompt<{ target: ConfigTarget }>([
    {
      type: 'list',
      name: 'target',
      message: 'What do you want to manage?',
      choices: [
        { name: 'Saved settings', value: 'setting' },
        { name: 'API keys', value: 'credential' },
      ],
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

export const promptConfigSettingName = () =>
  inquirer.prompt<{ name: ConfigSettingKey }>([
    {
      type: 'list',
      name: 'name',
      message: 'Select setting:',
      choices: Object.values(CONFIG_SETTING_KEYS).map((key) => ({
        name: CONFIG_SETTING_LABELS[key],
        value: key,
      })),
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

export const promptConfigValue = async (
  message: string,
  validate?: (input: string) => boolean | string,
) => {
  const { value } = await inquirer.prompt<{ value: string }>([
    {
      type: 'input',
      name: 'value',
      message,
      validate: validate ?? ((input) => input.length > 0),
    },
  ]);
  return value;
};

export const promptSecretValue = async (message: string) => {
  const { key } = await inquirer.prompt<{ key: string }>([
    {
      type: 'password',
      name: 'key',
      message,
      mask: '*',
      validate: (input) => input.length > 0,
    },
  ]);
  return key;
};
