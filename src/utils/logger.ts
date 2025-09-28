import chalk from 'chalk';

export const logger = {
  info: (msg: string) => console.log(chalk.blue('ℹ️  ' + msg)),
  success: (msg: string) => console.log(chalk.green('✅ ' + msg)),
  warn: (msg: string) => console.warn(chalk.yellow('⚠️  ' + msg)),
  error: (msg: string) => console.error(chalk.red('❌ ' + msg)),
};
