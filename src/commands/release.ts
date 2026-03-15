import { runReleaseFlow } from '@/domains/release/release.service.js';
import type { ReleaseOptions } from '@/domains/release/release.types.js';

export const releaseCommand = async (options: ReleaseOptions) => {
  await runReleaseFlow(options);
};
