import { createFeatureFlag } from '@/domains/featureFlag/featureFlag.service.js';
import { promptFeatureFlag } from '@/ui/prompts/featureFlag.prompts.js';

export const featureFlagCommand = async () => {
  const answers = await promptFeatureFlag();
  createFeatureFlag(answers);
};
