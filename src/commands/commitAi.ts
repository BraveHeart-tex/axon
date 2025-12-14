import { runCommitAiFlow } from '@/domains/ai/commit/commitAi.service.js';

export const commitAiCommand = async () => {
  await runCommitAiFlow();
};
