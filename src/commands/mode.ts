import { CLI_MODES, CliMode } from '../constants/mode.js';
import { setCliModeConfig } from '../domains/mode/mode.service.js';
import { logger } from '../utils/logger.js';

export const setCliMode = async (type: CliMode) => {
  if (type !== CLI_MODES.JIRA && type !== CLI_MODES.DEFAULT) {
    logger.error(`Invalid CLI Mode. Valid modes are: ${Object.values(CLI_MODES).join(', ')}`);
    process.exit(1);
  }

  setCliModeConfig(type);

  if (type === CLI_MODES.JIRA) {
    logger.info('CLI Mode set to JIRA');
  } else if (type === CLI_MODES.DEFAULT) {
    logger.info('CLI Mode set to DEFAULT');
  }
};
