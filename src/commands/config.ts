import {
  deleteCredential,
  listCredentials,
  setCredential,
  viewCredential,
} from '@/domains/config/config.service.js';
import {
  promptApiKey,
  promptConfigAction,
  promptCredentialName,
} from '@/ui/prompts/config.prompts.js';

export const configCommand = async () => {
  const { action } = await promptConfigAction();

  if (action === 'list') {
    listCredentials();
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
