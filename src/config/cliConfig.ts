import { CliMode } from '../constants/mode.js';
import { readConfig, writeConfig } from '../store/configStrore.js';

export const getCliMode = (): CliMode => readConfig().mode;

export const setCliMode = (mode: CliMode) => {
  writeConfig({ mode });
};
