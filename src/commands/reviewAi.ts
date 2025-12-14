import { resolveDiffInput } from '@/domains/ai/review/flows/resolveDiffInput.flow.js';
import { runReviewAiFlow } from '@/domains/ai/review/reviewAi.service.js';
import { DiffOptions } from '@/domains/ai/review/reviewAi.types.js';

export const reviewAiCommand = async (options: DiffOptions) => {
  const diffInput = await resolveDiffInput(options);

  if (!diffInput) {
    console.error('Diff input could not be found');
    process.exit(1);
  }

  await runReviewAiFlow(diffInput);
};
