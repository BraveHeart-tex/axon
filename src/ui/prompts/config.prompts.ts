import { confirm, input, password, select, Separator } from '@inquirer/prompts';
import c from 'ansi-colors';

import type { ConfigEntry } from '@/domains/config/config.types.js';
import { truncate } from '@/misc/truncate.js';

const LABEL_WIDTH = 16;
const VALUE_MAX_LENGTH = 45;

const selectTheme = {
  prefix: c.cyan('?'),
  icon: { cursor: c.cyan('❯') },
  style: {
    highlight: (text: string) => c.cyan.bold(text),
  },
};

const renderValue = (entry: ConfigEntry): string => {
  if (entry.kind === 'credential') {
    return entry.isSet ? c.green('••• set') : c.dim('(unset)');
  }

  if (entry.value === null) {
    return c.dim('(unset)');
  }

  return c.white(truncate(entry.value, VALUE_MAX_LENGTH));
};

const renderEntryChoice = (entry: ConfigEntry) => ({
  name: `${entry.label.padEnd(LABEL_WIDTH)} ${renderValue(entry)}`,
  value: entry,
});

export type EntryAction = 'set' | 'clear' | 'reveal' | 'back';

export const promptConfigEntry = async (entries: ConfigEntry[]): Promise<ConfigEntry | 'exit'> => {
  const settingChoices = entries.filter((entry) => entry.kind === 'setting').map(renderEntryChoice);
  const credentialChoices = entries
    .filter((entry) => entry.kind === 'credential')
    .map(renderEntryChoice);

  return await select<ConfigEntry | 'exit'>({
    message: 'Axon config',
    loop: false,
    pageSize: 20,
    theme: selectTheme,
    choices: [
      new Separator(`\n  ${c.bold('Settings')}`),
      ...settingChoices,
      new Separator(`\n  ${c.bold('Credentials')}`),
      ...credentialChoices,
      new Separator(' '),
      { name: 'Exit', value: 'exit' },
    ],
  });
};

export const promptEntryAction = async (entry: ConfigEntry): Promise<EntryAction> => {
  const noun = entry.isSecret ? 'key' : 'value';
  const choices: { name: string; value: EntryAction }[] = [];

  if (!entry.isSet) {
    choices.push({ name: `Set ${noun}`, value: 'set' });
  } else {
    choices.push({ name: `Change ${noun}`, value: 'set' });
    if (entry.isSecret) {
      choices.push({ name: 'Reveal', value: 'reveal' });
    }
    choices.push({ name: 'Clear', value: 'clear' });
  }

  choices.push({ name: 'Back', value: 'back' });

  return await select<EntryAction>({
    message: entry.label,
    theme: selectTheme,
    choices,
  });
};

export const confirmClearEntry = async (label: string): Promise<boolean> =>
  await confirm({
    message: `Clear ${c.bold(label)}?`,
    default: false,
  });

export const promptConfigValue = async (
  message: string,
  validate?: (input: string) => boolean | string,
  defaultValue?: string,
) => {
  const value = await input({
    message,
    default: defaultValue,
    validate: validate ?? ((input) => input.length > 0),
  });

  return value;
};

export const promptSecretValue = async (message: string) => {
  const key = await password({
    message,
    mask: '*',
    validate: (input) => input.length > 0,
  });

  return key;
};
