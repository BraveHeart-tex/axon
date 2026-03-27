import c from 'ansi-colors';

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
    const a = c.cyan(line.substring(0, 11)); // "A" segment
    const x = c.blueBright(line.substring(11, 21)); // "X" segment
    const o = c.cyan(line.substring(21, 31)); // "O" segment
    const n = c.blueBright(line.substring(31)); // "N" segment

    return a + x + o + n;
  })
  .join('\n');
