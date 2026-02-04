import { getClassificationPrompt } from '../../ai.prompts.js';
import { streamAiResponse } from '../../ai.service.js';
import { safeParseClassification } from '../safeParseClassification.js';
import { CommitType } from '../types.js';
import { CommitContext } from './resolveCommitContext.flow.js';

export interface CommitClassification {
  type: CommitType;
  scope?: string;
  intent: string;
}

export const classifyCommit = async (
  apiKey: string,
  context: CommitContext,
): Promise<CommitClassification> => {
  let output = '';

  await streamAiResponse({
    apiKey,
    prompt: getClassificationPrompt(context),
    onChunk: (chunk) => (output += chunk),
  });

  return safeParseClassification(output);
};
