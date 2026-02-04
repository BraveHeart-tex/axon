import { getCommitMessagePrompt } from '../../ai.prompts.js';
import { streamAiResponse } from '../../ai.service.js';
import { CommitClassification } from './classifyCommit.flow.js';

export const generateCommitMessage = async (
  apiKey: string,
  classification: CommitClassification,
): Promise<string> => {
  let fullMessage = '';

  await streamAiResponse({
    apiKey,
    prompt: getCommitMessagePrompt(classification),
    onChunk: (chunk) => {
      fullMessage += chunk;
    },
  });

  return fullMessage.replace(/\s+/g, ' ').split('\n')[0].trim();
};
