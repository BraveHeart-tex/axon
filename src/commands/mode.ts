import { setCliMode } from '../config/cliConfig.js';
import { CLI_MODES, CliMode } from '../constants/mode.js';
import { logger } from '../utils/logger.js';

export const setMode = async (type: CliMode) => {
  if (type !== CLI_MODES.JIRA && type !== CLI_MODES.DEFAULT) {
    logger.error(`Invalid CLI Mode. Valid modes are: ${Object.values(CLI_MODES).join(', ')}`);
    process.exit(1);
  }

  setCliMode(type);

  if (type === CLI_MODES.JIRA) {
    logger.info('CLI Mode set to JIRA');
  } else if (type === CLI_MODES.DEFAULT) {
    logger.info('CLI Mode set to DEFAULT');
  }
};
