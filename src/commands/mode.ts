import { CLI_MODES, CliMode } from '../constants/mode.js';
import { logger } from '../utils/logger.js';

export const setCliMode = async (type: CliMode) => {
  if (type !== CLI_MODES.JIRA && type !== CLI_MODES.DEFAULT) {
    logger.error('Invalid mode');
    process.exit(1);
  }

  if (type === CLI_MODES.JIRA) {
    logger.info('jira mode');
  } else if (type === CLI_MODES.DEFAULT) {
    logger.info('off mode');
  }
};
