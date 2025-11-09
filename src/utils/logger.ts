import chalk from 'chalk';

const color = {
  info: chalk.hex('#00BFFF'), // bright blue, readable on dark & light
  success: chalk.hex('#00C851'), // vivid green, not neon
  warn: chalk.hex('#FF8800'), // orange—visible everywhere
  error: chalk.hex('#FF4444'), // bright red, solid contrast
};

export const logger = {
  info: (msg: string) => console.log(color.info(`ℹ️  ${msg}`)),
  success: (msg: string) => console.log(color.success(`✅  ${msg}`)),
  warn: (msg: string) => console.warn(color.warn(`⚠️  ${msg}`)),
  error: (msg: string) => console.error(color.error(`❌  ${msg}`)),
};
