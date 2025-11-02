import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';

export const updateGlobalDts = (flagName: string) => {
  const globalFile = path.resolve(process.cwd(), 'global.d.ts');
  if (!fs.existsSync(globalFile)) {
    logger.warn('global.d.ts file does not exist');
    return;
  }

  let content = fs.readFileSync(globalFile, 'utf-8');

  const featureFlagRegex = /(\/\/ Feature Flags\s*\n)([\s\S]*?)(\n\s*\/\/ Public API Routes)/;
  const match = content.match(featureFlagRegex);

  if (!match) {
    logger.warn('Could not find Feature Flags section in global.d.ts');
    return;
  }

  const prefix = match[1];
  const block = match[2];
  const suffix = match[3];

  if (block.includes(flagName)) {
    logger.warn(`${flagName} already exists in global.d.ts`);
    return;
  }

  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  lines.push(`${flagName}: string;`);
  lines.sort((a, b) => a.localeCompare(b));

  const newBlock = lines.map((l) => `    ${l}`).join('\n');
  content = content.replace(featureFlagRegex, `${prefix}${newBlock}${suffix}`);

  fs.writeFileSync(globalFile, content, 'utf-8');
  logger.success(`Added ${flagName} to global.d.ts`);
};
