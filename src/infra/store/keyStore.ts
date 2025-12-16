import fs from 'fs';
import os from 'os';
import path from 'path';

import { CredentialKey } from '@/domains/config/config.types.js';

const INDEX_PATH = path.join(os.homedir(), '.axon', 'keys.json');

const ensureIndexFile = () => {
  const dir = path.dirname(INDEX_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(INDEX_PATH)) fs.writeFileSync(INDEX_PATH, JSON.stringify([]));
};

export const addKeyName = (name: CredentialKey) => {
  ensureIndexFile();
  const keys = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as string[];
  if (!keys.includes(name)) keys.push(name);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(keys, null, 2));
};

export const removeKeyName = (name: CredentialKey) => {
  ensureIndexFile();
  const keys = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as string[];
  const filtered = keys.filter((k) => k !== name);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(filtered, null, 2));
};

export const listKeyNames = (): string[] => {
  ensureIndexFile();
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as string[];
};
