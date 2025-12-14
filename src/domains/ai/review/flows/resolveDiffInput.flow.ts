import fs from 'node:fs';

import { DiffOptions } from '../reviewAi.types.js';

export const resolveDiffInput = async (options: DiffOptions): Promise<string | null> => {
  try {
    if (options.diff) return options.diff;

    if (options.diffFile) {
      const content = fs.readFileSync(options.diffFile, 'utf-8');

      if (!content) {
        console.error('Diff content cannot be found');
        process.exit(1);
      }

      return content;
    }

    return null;
  } catch (error) {
    console.error('Error resolving diff input:', error);
    process.exit(1);
  }
};
