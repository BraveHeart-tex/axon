import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getConfigEntries } from '@/domains/config/config.service.js';
import { ConfigManager } from '@/infra/config/configManager.js';

vi.mock('@/infra/config/configManager.js', () => ({
  ConfigManager: {
    get: vi.fn(),
    listSecrets: vi.fn(),
  },
}));

describe('getConfigEntries', () => {
  beforeEach(() => {
    vi.mocked(ConfigManager.get).mockReturnValue('');
    vi.mocked(ConfigManager.listSecrets).mockReturnValue([]);
  });

  it('treats non-string setting values as unset', () => {
    vi.mocked(ConfigManager.get).mockImplementation((key) => {
      if (key === 'jiraJql') return 42 as unknown as string;
      return '';
    });

    const entries = getConfigEntries();
    const jiraJql = entries.find((entry) => entry.key === 'jiraJql');

    expect(jiraJql).toMatchObject({
      kind: 'setting',
      isSet: false,
      value: null,
    });
  });
});
