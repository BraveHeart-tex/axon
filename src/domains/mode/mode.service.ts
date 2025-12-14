import { readConfig, writeConfig } from '../../infra/store/configStrore.js';
import { CliMode } from './mode.types.js';

export const getCliModeConfig = (): CliMode => readConfig().mode;

export const setCliModeConfig = (mode: CliMode) => {
  writeConfig({ mode });
};
