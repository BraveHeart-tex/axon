import fs from 'fs';
import os from 'os';
import path from 'path';

import { CliMode } from '@/domains/mode/mode.types.js';

const AXON_DIR = path.join(os.homedir(), '.axon');
const CONFIG_PATH = path.join(AXON_DIR, 'config.json');

export interface AxonConfig {
  mode: CliMode;
  jiraCloudUrl: string;
  jiraJql: string;
  jiraEmail: string;
}

const DEFAULT_CONFIG: AxonConfig = {
  mode: 'default',
  jiraCloudUrl: '',
  jiraJql: '',
  jiraEmail: '',
};

const ensureConfigFile = () => {
  if (!fs.existsSync(AXON_DIR)) {
    fs.mkdirSync(AXON_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }
};

export const readConfig = (): AxonConfig => {
  ensureConfigFile();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // fallback if file is corrupted
    return DEFAULT_CONFIG;
  }
};

export const writeConfig = (update: Partial<AxonConfig>) => {
  ensureConfigFile();

  const current = readConfig();
  const next = { ...current, ...update };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
};
