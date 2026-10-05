import fs from 'fs';
import path from 'path';

import { getAxonDir } from '@/infra/store/configStore.js';

export const getProjectConfigPath = (slug: string) =>
  path.join(getAxonDir(), 'projects', `${slug}.json`);

export const readProjectConfigFile = (configPath: string): string | null => {
  try {
    return fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Could not read ${configPath}: ${(error as Error).message}`);
  }
};

export const writeProjectConfigFile = (configPath: string, data: unknown) => {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, configPath);
};
