import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAiModel } from '@/domains/ai/ai.config.js';
import { AI_MODEL_ENV_KEY, AI_MODELS, DEFAULT_AI_MODEL } from '@/domains/ai/ai.constants.js';
import { writeConfig } from '@/infra/store/configStore.js';

const TEST_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-ai-model-test-'));
process.env.AXON_CONFIG_DIR = TEST_CONFIG_DIR;

describe('resolveAiModel', () => {
  it('uses the default model when env and config are unset', () => {
    delete process.env[AI_MODEL_ENV_KEY];
    writeConfig({ aiModel: '' });

    expect(resolveAiModel()).toBe(DEFAULT_AI_MODEL);
  });

  it('prefers the environment variable over saved config', () => {
    process.env[AI_MODEL_ENV_KEY] = AI_MODELS.GPT_OSS_120B;

    expect(resolveAiModel()).toBe(AI_MODELS.GPT_OSS_120B);

    delete process.env[AI_MODEL_ENV_KEY];
  });

  it('uses saved config when env is unset', () => {
    delete process.env[AI_MODEL_ENV_KEY];
    writeConfig({ aiModel: AI_MODELS.GPT_OSS_120B });

    expect(resolveAiModel()).toBe(AI_MODELS.GPT_OSS_120B);
  });

  it('throws on an invalid environment model', () => {
    process.env[AI_MODEL_ENV_KEY] = 'bad-model';

    expect(() => resolveAiModel()).toThrow(/Invalid AI model/);

    delete process.env[AI_MODEL_ENV_KEY];
  });
});
