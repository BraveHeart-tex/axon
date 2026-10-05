import type { AiModelSource, ProjectContext } from '@/domains/project/project.types.js';
import { logger } from '@/infra/logger.js';
import { writeConfig } from '@/infra/store/configStore.js';

import { AI_MODEL_ENV_KEY, AI_MODELS } from './ai.constants.js';
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

export const setStoredAiModel = (model: AiModel): void => {
  writeConfig({ aiModel: model });
};

export const clearStoredAiModel = (): void => {
  writeConfig({ aiModel: '' });
};

const SOURCE_LABELS: Record<AiModelSource, string> = {
  env: AI_MODEL_ENV_KEY,
  project: 'project config',
  global: 'config',
  default: 'default',
};

const STATUS_LABELS: Record<AiModelSource, string> = {
  env: `from ${AI_MODEL_ENV_KEY}`,
  project: 'project config',
  global: 'saved config',
  default: 'default',
};

export const resolveAiModel = (context: ProjectContext): AiModel =>
  validateAiModel(context.aiModel, SOURCE_LABELS[context.aiModelSource]);

export const showAiModelStatus = (context: ProjectContext): void => {
  const resolvedModel = resolveAiModel(context);
  logger.info(`AI model: ${resolvedModel} (${STATUS_LABELS[context.aiModelSource]})`);
};
