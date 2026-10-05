import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addKeyName, listKeyNames, removeKeyName } from '@/infra/store/keyStore.js';

let configDir: string;

describe('keyStore', () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-keys-'));
    vi.stubEnv('AXON_CONFIG_DIR', configDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('stores the key index under AXON_CONFIG_DIR', () => {
    addKeyName('ai');

    const indexPath = path.join(configDir, 'keys.json');
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf-8'))).toEqual(['ai']);
    expect(listKeyNames()).toEqual(['ai']);

    removeKeyName('ai');
    expect(listKeyNames()).toEqual([]);
  });
});
