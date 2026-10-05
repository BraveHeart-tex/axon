import { runCommitAiFlow } from '@/domains/ai/commit/commitAi.service.js';
import { getProjectContext } from '@/domains/project/project.service.js';

export const commitAiCommand = async () => {
  await runCommitAiFlow(getProjectContext());
};
