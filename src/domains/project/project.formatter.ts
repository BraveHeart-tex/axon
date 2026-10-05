import os from 'node:os';
import path from 'node:path';

import c from 'ansi-colors';

import { logger } from '@/infra/logger.js';

import { isProjectConfigError } from './project.errors.js';
import type { ProjectContext } from './project.types.js';

export const formatConfigPath = (filePath: string) => {
  const home = os.homedir();
  return filePath === home || filePath.startsWith(`${home}${path.sep}`)
    ? `~${filePath.slice(home.length)}`
    : filePath;
};

export const formatFlowBanner = (context: ProjectContext) =>
  context.source === 'project' && context.configPath
    ? `flow: ${context.flow.name} · ${formatConfigPath(context.configPath)}`
    : `flow: ${context.flow.name} (default) · run axon init to configure this repo`;

export const printFlowBanner = (context: ProjectContext) => {
  console.log(c.dim(formatFlowBanner(context)));
};

export const reportProjectContextError = (error: unknown) => {
  if (isProjectConfigError(error)) {
    logger.error('Invalid project config:');
    for (const problem of error.problems) {
      console.error(`  ${problem}`);
    }
    console.error('  Fix the file by hand, or delete it and run axon init.');
    return;
  }

  logger.error(error instanceof Error ? error.message : String(error));
};
