import { CREDENTIAL_KEYS } from './config.constants.js';

export type CredentialKey = (typeof CREDENTIAL_KEYS)[keyof typeof CREDENTIAL_KEYS];
