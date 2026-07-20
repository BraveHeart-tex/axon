import { CONFIG_SETTING_KEYS, CREDENTIAL_KEYS } from './config.constants.js';

export type CredentialKey = (typeof CREDENTIAL_KEYS)[keyof typeof CREDENTIAL_KEYS];

export type ConfigSettingKey = (typeof CONFIG_SETTING_KEYS)[keyof typeof CONFIG_SETTING_KEYS];

export interface SettingEntry {
  kind: 'setting';
  key: ConfigSettingKey;
  label: string;
  isSecret: false;
  isSet: boolean;
  value: string | null;
}

export interface CredentialEntry {
  kind: 'credential';
  key: CredentialKey;
  label: string;
  isSecret: true;
  isSet: boolean;
  value: null;
}

export type ConfigEntry = SettingEntry | CredentialEntry;
