import { CLI_MODES } from '../../constants/mode.js';

export type CliMode = (typeof CLI_MODES)[keyof typeof CLI_MODES];
