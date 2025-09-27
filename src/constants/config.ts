export const CREDENTIAL_KEYS = {
  AI: 'ai',
} as const;

export type CredentialKey = (typeof CREDENTIAL_KEYS)[keyof typeof CREDENTIAL_KEYS];
