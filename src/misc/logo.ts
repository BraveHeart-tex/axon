import chalk from 'chalk';

const rawLogo = [
  ' ',
  '  /$$$$$$  /$$   /$$  /$$$$$$  /$$$$$$$ ',
  ' |____  $$|  $$ /$$/ /$$__  $$| $$__  $$',
  '  /$$$$$$$ \\  $$$$/ | $$  \\ $$| $$  \\ $$',
  ' /$$__  $$  >$$  $$ | $$  | $$| $$  | $$',
  '|  $$$$$$$ /$$/\\  $$|  $$$$$$/| $$  | $$',
  ' \\_______/|__/  \\__/ \\______/ |__/  |__/',
  ' ',
];

export const AXON_LOGO = rawLogo
  .map((line) => {
    const a = chalk.cyan(line.substring(0, 11)); // "A" segment
    const x = chalk.blueBright(line.substring(11, 21)); // "X" segment
    const o = chalk.cyan(line.substring(21, 31)); // "O" segment
    const n = chalk.blueBright(line.substring(31)); // "N" segment

    return a + x + o + n;
  })
  .join('\n');
