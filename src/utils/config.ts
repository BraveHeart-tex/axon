import keytar from 'keytar';
import { addKeyName, listKeyNames, removeKeyName } from './indexStore.js';

const SERVICE = 'axon-cli';

export const setApiKey = async (name: string, key: string) => {
  await keytar.setPassword(SERVICE, name, key);
  addKeyName(name);
};

export const getApiKey = async (name: string): Promise<string | null> => {
  return await keytar.getPassword(SERVICE, name);
};

export const deleteApiKey = async (name: string) => {
  await keytar.deletePassword(SERVICE, name);
  removeKeyName(name);
};

export const listApiKeys = (): string[] => {
  return listKeyNames();
};
