import { updateProjectConfig } from '@/domains/project/project.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { getConfigPath, writeConfig } from '@/infra/store/configStore.js';

import { CliMode } from './mode.types.js';

export const setCliModeConfig = (mode: CliMode, context: ProjectContext): string => {
  if (context.source === 'project' && context.configPath) {
    updateProjectConfig(context.configPath, { mode });
    return context.configPath;
  }

  writeConfig({ mode });
  return getConfigPath();
};
