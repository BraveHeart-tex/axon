import inquirer from 'inquirer';

import type { ReleaseInput, ReleaseOptions } from '../release.types.js';
import { resolveListBasedRelease } from './resolveListBasedRelease.flow.js';
import { resolveManualRelease } from './resolveManualRelease.flow.js';

export const resolveReleaseInput = async (options: ReleaseOptions): Promise<ReleaseInput> => {
  const { pickMethod } = await inquirer.prompt<{ pickMethod: 'manual' | 'list' }>([
    {
      type: 'list',
      name: 'pickMethod',
      message: 'How do you want to select commits?',
      choices: [
        { name: 'Paste commit hashes manually', value: 'manual' },
        { name: 'Select from recent commits', value: 'list' },
      ],
    },
  ]);

  return pickMethod === 'manual' ? resolveManualRelease() : resolveListBasedRelease(options);
};
