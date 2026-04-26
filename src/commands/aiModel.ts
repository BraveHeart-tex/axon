import {
  clearStoredAiModel,
  listSupportedAiModels,
  setStoredAiModel,
  showAiModelStatus,
} from '@/domains/ai/ai.config.js';
import { AiModel } from '@/domains/ai/ai.types.js';
import { logger } from '@/infra/logger.js';

export const aiModelCommand = async (
  model?: string,
  options?: { clear?: boolean; list?: boolean },
) => {
  if (options?.list) {
    logger.info(`Supported AI models: ${listSupportedAiModels().join(', ')}`);
    return;
  }

  if (options?.clear) {
    clearStoredAiModel();
    logger.info('Saved AI model cleared. Axon will use AXON_AI_MODEL or the default model.');
    return;
  }

  if (!model) {
    showAiModelStatus();
    return;
  }

  const supportedModels = listSupportedAiModels();
  if (!supportedModels.includes(model as AiModel)) {
    logger.error(`Invalid AI model. Valid models are: ${supportedModels.join(', ')}`);
    process.exit(1);
  }

  setStoredAiModel(model as AiModel);
  logger.info(`Saved AI model: ${model}`);
};
