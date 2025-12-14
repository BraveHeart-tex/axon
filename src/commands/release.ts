import { runReleaseFlow } from '@/domains/release/release.service.js';
import { ReleaseOptions } from '@/domains/release/release.types.js';

export const releaseCommand = async (options: ReleaseOptions) => {
  await runReleaseFlow(options);
};
