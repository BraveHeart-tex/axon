import fs from 'fs';
import path from 'path';

import { CredentialKey } from '@/domains/config/config.types.js';
import { getAxonDir } from '@/infra/store/configStore.js';

const getIndexPath = () => path.join(getAxonDir(), 'keys.json');

const ensureIndexFile = () => {
  const indexPath = getIndexPath();
  const dir = path.dirname(indexPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, JSON.stringify([]));
  return indexPath;
};

export const addKeyName = (name: CredentialKey) => {
  const indexPath = ensureIndexFile();
  const keys = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as string[];
  if (!keys.includes(name)) keys.push(name);
  fs.writeFileSync(indexPath, JSON.stringify(keys, null, 2));
};

export const removeKeyName = (name: CredentialKey) => {
  const indexPath = ensureIndexFile();
  const keys = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as string[];
  const filtered = keys.filter((k) => k !== name);
  fs.writeFileSync(indexPath, JSON.stringify(filtered, null, 2));
};

export const listKeyNames = (): string[] => {
  const indexPath = ensureIndexFile();
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as string[];
};
