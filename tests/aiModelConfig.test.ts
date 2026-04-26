import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveAiModel } from '@/domains/ai/ai.config.js';
import { AI_MODEL_ENV_KEY, AI_MODELS, DEFAULT_AI_MODEL } from '@/domains/ai/ai.constants.js';
import { writeConfig } from '@/infra/store/configStore.js';

const TEST_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-ai-model-test-'));
process.env.AXON_CONFIG_DIR = TEST_CONFIG_DIR;

test('uses the default model when env and config are unset', () => {
  delete process.env[AI_MODEL_ENV_KEY];
  writeConfig({ aiModel: '' });

  assert.equal(resolveAiModel(), DEFAULT_AI_MODEL);
});

test('prefers the environment variable over saved config', () => {
  process.env[AI_MODEL_ENV_KEY] = AI_MODELS.QWEN3_32B;
  writeConfig({ aiModel: AI_MODELS.GPT_OSS_20B });

  assert.equal(resolveAiModel(), AI_MODELS.QWEN3_32B);

  delete process.env[AI_MODEL_ENV_KEY];
});

test('uses saved config when env is unset', () => {
  delete process.env[AI_MODEL_ENV_KEY];
  writeConfig({ aiModel: AI_MODELS.GPT_OSS_120B });

  assert.equal(resolveAiModel(), AI_MODELS.GPT_OSS_120B);
});

test('throws on an invalid environment model', () => {
  process.env[AI_MODEL_ENV_KEY] = 'bad-model';
  writeConfig({ aiModel: '' });

  assert.throws(() => resolveAiModel(), /Invalid AI model/);

  delete process.env[AI_MODEL_ENV_KEY];
});
