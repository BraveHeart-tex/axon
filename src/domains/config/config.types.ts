import { CONFIG_SETTING_KEYS, CREDENTIAL_KEYS } from './config.constants.js';

export type CredentialKey = (typeof CREDENTIAL_KEYS)[keyof typeof CREDENTIAL_KEYS];

export type ConfigSettingKey = (typeof CONFIG_SETTING_KEYS)[keyof typeof CONFIG_SETTING_KEYS];
