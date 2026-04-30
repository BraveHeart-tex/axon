import { ConfigManager } from '@/infra/config/configManager.js';
import { logger } from '@/infra/logger.js';

import { JIRA_CLOUD_URL_REGEX } from '../jira/jira.constants.js';
import { CONFIG_SETTING_LABELS } from './config.constants.js';
import { ConfigSettingKey, CredentialKey } from './config.types.js';

export const listConfigSettings = () => {
  const settings = Object.entries(CONFIG_SETTING_LABELS).map(([key, label]) => {
    const value = ConfigManager.get(key as ConfigSettingKey);
    return `${label}: ${value || '(unset)'}`;
  });

  logger.info(`Saved settings:\n${settings.join('\n')}`);
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

export const viewConfigSetting = (name: ConfigSettingKey) => {
  const value = ConfigManager.get(name);
  if (value) logger.info(`${CONFIG_SETTING_LABELS[name]}: ${value}`);
  else logger.info(`No value found for "${CONFIG_SETTING_LABELS[name]}".`);
};

export const deleteConfigSetting = (name: ConfigSettingKey) => {
  ConfigManager.set(name, '');
  logger.info(`Setting "${CONFIG_SETTING_LABELS[name]}" cleared.`);
};

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

export const validateConfigSetting = (name: ConfigSettingKey, value: string): true | string => {
  if (value.trim().length === 0) {
    return `${CONFIG_SETTING_LABELS[name]} cannot be empty.`;
  }

  if (name === 'jiraCloudUrl' && !JIRA_CLOUD_URL_REGEX.test(value)) {
    return 'Invalid Jira Cloud URL.';
  }

  return true;
};
