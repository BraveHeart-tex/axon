import {
  deleteConfigSetting,
  deleteCredential,
  getConfigEntries,
  setConfigSetting,
  setCredential,
  validateConfigSetting,
  viewCredential,
} from '@/domains/config/config.service.js';
import type { ConfigEntry, CredentialEntry, SettingEntry } from '@/domains/config/config.types.js';
import {
  confirmClearEntry,
  type EntryAction,
  promptConfigEntry,
  promptConfigValue,
  promptEntryAction,
  promptSecretValue,
} from '@/ui/prompts/config.prompts.js';

const handleSetting = async (entry: SettingEntry, action: EntryAction): Promise<void> => {
  if (action === 'set') {
    const value = await promptConfigValue(
      `Enter value for "${entry.label}":`,
      (input) => validateConfigSetting(entry.key, input),
      entry.value ?? undefined,
    );
    setConfigSetting(entry.key, value);
    return;
  }

  if (action === 'clear' && (await confirmClearEntry(entry.label))) {
    deleteConfigSetting(entry.key);
  }
};

const handleCredential = async (entry: CredentialEntry, action: EntryAction): Promise<void> => {
  if (action === 'set') {
    const key = await promptSecretValue(`Enter ${entry.label}:`);
    await setCredential(entry.key, key);
    return;
  }

  if (action === 'reveal') {
    await viewCredential(entry.key);
    return;
  }

  if (action === 'clear' && (await confirmClearEntry(entry.label))) {
    await deleteCredential(entry.key);
  }
};

const handleEntry = async (entry: ConfigEntry): Promise<void> => {
  const action = await promptEntryAction(entry);

  if (action === 'back') return;

  if (entry.kind === 'setting') {
    await handleSetting(entry, action);
    return;
  }

  await handleCredential(entry, action);
};

export const configCommand = async (): Promise<void> => {
  while (true) {
    const entries = getConfigEntries();
    const selected = await promptConfigEntry(entries);

    if (selected === 'exit') return;

    await handleEntry(selected);
  }
};
