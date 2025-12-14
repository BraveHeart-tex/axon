import keytar from 'keytar';

import { CredentialKey } from '@/domains/config/config.types.js';
import { addKeyName, listKeyNames, removeKeyName } from '@/infra/store/keyStore.js';

const SERVICE = 'axon-cli';

export const setApiKey = async (name: CredentialKey, key: string) => {
  await keytar.setPassword(SERVICE, name, key);
  addKeyName(name);
};

export const getApiKey = async (name: CredentialKey): Promise<string | null> =>
  await keytar.getPassword(SERVICE, name);

export const deleteApiKey = async (name: CredentialKey) => {
  await keytar.deletePassword(SERVICE, name);
  removeKeyName(name);
};

export const listApiKeys = (): string[] => listKeyNames();
