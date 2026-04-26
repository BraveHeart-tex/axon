import fs from 'fs';
import os from 'os';
import path from 'path';

import { CliMode } from '@/domains/mode/mode.types.js';

const DEFAULT_AXON_DIR = path.join(os.homedir(), '.axon');
const AXON_CONFIG_DIR_ENV_KEY = 'AXON_CONFIG_DIR';

const getAxonDir = () => process.env[AXON_CONFIG_DIR_ENV_KEY] || DEFAULT_AXON_DIR;

const getConfigPath = () => path.join(getAxonDir(), 'config.json');

export interface AxonConfig {
  mode: CliMode;
  jiraCloudUrl: string;
  jiraJql: string;
  jiraEmail: string;
  aiModel: string;
}

const DEFAULT_CONFIG: AxonConfig = {
  mode: 'default',
  jiraCloudUrl: '',
  jiraJql: '',
  jiraEmail: '',
  aiModel: '',
};

const ensureConfigFile = () => {
  const axonDir = getAxonDir();
  const configPath = getConfigPath();

  if (!fs.existsSync(axonDir)) {
    fs.mkdirSync(axonDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }
};

export const readConfig = (): AxonConfig => {
  ensureConfigFile();
  const configPath = getConfigPath();

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // fallback if file is corrupted
    return DEFAULT_CONFIG;
  }
};

export const writeConfig = (update: Partial<AxonConfig>) => {
  ensureConfigFile();
  const configPath = getConfigPath();

  const current = readConfig();
  const next = { ...current, ...update };

  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8');
};
