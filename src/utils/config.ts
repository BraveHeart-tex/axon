import keytar from 'keytar';
import { addKeyName, listKeyNames, removeKeyName } from './indexStore.js';
import { CredentialKey } from '../constants/config.js';

const SERVICE = 'axon-cli';

export const setApiKey = async (name: CredentialKey, key: string) => {
  await keytar.setPassword(SERVICE, name, key);
  addKeyName(name);
};

export const getApiKey = async (name: CredentialKey): Promise<string | null> => {
  return await keytar.getPassword(SERVICE, name);
};

export const deleteApiKey = async (name: CredentialKey) => {
  await keytar.deletePassword(SERVICE, name);
  removeKeyName(name);
};

export const listApiKeys = (): string[] => {
  return listKeyNames();
};
