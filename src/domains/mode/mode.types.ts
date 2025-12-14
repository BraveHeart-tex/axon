import { CLI_MODES } from './mode.constants.js';

export type CliMode = (typeof CLI_MODES)[keyof typeof CLI_MODES];
