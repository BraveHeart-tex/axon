import { runFeatureFlow } from '@/domains/feature/feature.service.js';
import { getProjectContext } from '@/domains/project/project.service.js';

export const featureCommand = async () => {
  await runFeatureFlow(getProjectContext());
};
