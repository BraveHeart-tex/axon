import { ConfigManager } from '@/infra/config/configManager.js';
import { logger } from '@/infra/logger.js';

import { JIRA_CLOUD_URL_REGEX } from '../jira/jira.constants.js';
import {
  CONFIG_SETTING_KEYS,
  CONFIG_SETTING_LABELS,
  CREDENTIAL_KEYS,
  CREDENTIAL_LABELS,
} from './config.constants.js';
import { ConfigEntry, ConfigSettingKey, CredentialKey } from './config.types.js';

export const getConfigEntries = (): ConfigEntry[] => {
  const settingEntries = Object.values(CONFIG_SETTING_KEYS).map((key): ConfigEntry => {
    const raw = ConfigManager.get(key);
    const value = typeof raw === 'string' ? raw.trim() : '';

    return {
      kind: 'setting',
      key,
      label: CONFIG_SETTING_LABELS[key],
      isSecret: false,
      isSet: value !== '',
      value: value !== '' ? value : null,
    };
  });

  const storedSecrets = new Set(ConfigManager.listSecrets());
  const credentialEntries = Object.values(CREDENTIAL_KEYS).map(
    (key): ConfigEntry => ({
      kind: 'credential',
      key,
      label: CREDENTIAL_LABELS[key],
      isSecret: true,
      isSet: storedSecrets.has(key),
      value: null,
    }),
  );

  return [...settingEntries, ...credentialEntries];
};

export const setConfigSetting = (name: ConfigSettingKey, value: string) => {
  const validationResult = validateConfigSetting(name, value);
  if (validationResult !== true) {
    logger.error(validationResult);
    return;
  }

  ConfigManager.set(name, value);
  logger.info(`Setting "${CONFIG_SETTING_LABELS[name]}" saved.`);
};

export const deleteConfigSetting = (name: ConfigSettingKey) => {
  ConfigManager.set(name, '');
  logger.info(`Setting "${CONFIG_SETTING_LABELS[name]}" cleared.`);
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

export const validateConfigSetting = (name: ConfigSettingKey, value: string): true | string => {
  if (value.trim().length === 0) {
    return `${CONFIG_SETTING_LABELS[name]} cannot be empty.`;
  }

  if (name === 'jiraCloudUrl' && !JIRA_CLOUD_URL_REGEX.test(value)) {
    return 'Invalid Jira Cloud URL.';
  }

  return true;
};
