import { logger } from '@/infra/logger.js';
import { readConfig, writeConfig } from '@/infra/store/configStore.js';

import { AI_MODEL_ENV_KEY, AI_MODELS, DEFAULT_AI_MODEL } from './ai.constants.js';
import { AiModel } from './ai.types.js';

const SUPPORTED_AI_MODELS = new Set<string>(Object.values(AI_MODELS));

const isSupportedAiModel = (value: string): value is AiModel => SUPPORTED_AI_MODELS.has(value);

const validateAiModel = (value: string, source: string): AiModel => {
  if (isSupportedAiModel(value)) {
    return value;
  }

  throw new Error(
    `Invalid AI model in ${source}: "${value}". Valid models are: ${Object.values(AI_MODELS).join(', ')}`,
  );
};

export const listSupportedAiModels = (): AiModel[] => Object.values(AI_MODELS);

export const getStoredAiModel = (): AiModel | '' => {
  const value = readConfig().aiModel;
  if (!value) return '';

  return validateAiModel(value, 'config');
};

export const setStoredAiModel = (model: AiModel): void => {
  writeConfig({ aiModel: model });
};

export const clearStoredAiModel = (): void => {
  writeConfig({ aiModel: '' });
};

export const resolveAiModel = (): AiModel => {
  const envModel = process.env[AI_MODEL_ENV_KEY];
  if (envModel) {
    return validateAiModel(envModel, AI_MODEL_ENV_KEY);
  }

  const storedModel = readConfig().aiModel;
  if (storedModel) {
    return validateAiModel(storedModel, 'config');
  }

  return DEFAULT_AI_MODEL;
};

export const showAiModelStatus = (): void => {
  const envModel = process.env[AI_MODEL_ENV_KEY];
  const storedModel = readConfig().aiModel;

  if (envModel) {
    const resolvedModel = validateAiModel(envModel, AI_MODEL_ENV_KEY);
    logger.info(`AI model: ${resolvedModel} (from ${AI_MODEL_ENV_KEY})`);
    return;
  }

  if (storedModel) {
    const resolvedModel = validateAiModel(storedModel, 'config');
    logger.info(`AI model: ${resolvedModel} (saved config)`);
    return;
  }

  logger.info(`AI model: ${DEFAULT_AI_MODEL} (default)`);
};
