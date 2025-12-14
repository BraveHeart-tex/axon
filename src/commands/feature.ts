import { runFeatureFlow } from '@/domains/feature/feature.service.js';

export const featureCommand = async () => {
  await runFeatureFlow();
};
