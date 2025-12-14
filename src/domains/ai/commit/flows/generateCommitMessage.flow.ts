import { getCommitMessagePrompt } from '../../ai.prompts.js';
import { streamAiResponse } from '../../ai.service.js';
import { CommitContext } from './resolveCommitContext.flow.js';

export const generateCommitMessage = async (
  apiKey: string,
  context: CommitContext,
): Promise<string> => {
  let fullMessage = '';

  await streamAiResponse({
    apiKey,
    prompt: getCommitMessagePrompt({
      diff: context.diff,
      inferredScope: context.inferredScope,
      inferredScopeType: context.inferredScopeType,
    }),
    onChunk: (chunk) => {
      fullMessage += chunk;
    },
  });

  return fullMessage.replace(/\s+/g, ' ').split('\n')[0].trim();
};
