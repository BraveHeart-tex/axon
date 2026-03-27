import c from 'ansi-colors';

const color = {
  info: c.blueBright,
  success: c.greenBright,
  warn: c.yellowBright,
  error: c.redBright,
};

export const logger = {
  info: (msg: string, showLabel = true) =>
    console.log(color.info(`${showLabel ? '[INFO]:' : ''} ${msg}`)),
  success: (msg: string) => console.log(color.success(`[SUCCESS]: ${msg}`)),
  warn: (msg: string) => console.warn(color.warn(`[WARN]: ${msg}`)),
  error: (msg: string) => console.error(color.error(`[ERROR]: ${msg}`)),
};
