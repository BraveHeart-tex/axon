import {
  deleteConfigSetting,
  deleteCredential,
  listConfigSettings,
  listCredentials,
  setConfigSetting,
  setCredential,
  validateConfigSetting,
  viewConfigSetting,
  viewCredential,
} from '@/domains/config/config.service.js';
import {
  promptApiKey,
  promptConfigAction,
  promptConfigSettingName,
  promptConfigTarget,
  promptConfigValue,
  promptCredentialName,
} from '@/ui/prompts/config.prompts.js';

export const configCommand = async () => {
  const { action } = await promptConfigAction();

  if (action === 'list') {
    listConfigSettings();
    listCredentials();
    return;
  }

  const { target } = await promptConfigTarget();

  if (target === 'setting') {
    const { name } = await promptConfigSettingName();

    switch (action) {
      case 'set': {
        const value = await promptConfigValue(`Enter value for "${name}":`, (input) =>
          validateConfigSetting(name, input),
        );
        setConfigSetting(name, value);
        break;
      }
      case 'view':
        viewConfigSetting(name);
        break;
      case 'delete':
        deleteConfigSetting(name);
        break;
    }
    return;
  }

  const { name } = await promptCredentialName();

  switch (action) {
    case 'set': {
      const { key } = await promptApiKey(name);
      await setCredential(name, key);
      break;
    }
    case 'view':
      await viewCredential(name);
      break;
    case 'delete':
      await deleteCredential(name);
      break;
  }
};
