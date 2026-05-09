import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

import { resolveAiModel } from './ai.config.js';

const createAiModel = (apiKey: string) => {
  const groq = createGroq({ apiKey });
  const modelId = resolveAiModel();
  return groq(modelId);
};

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const generateAiResponse = async ({
  apiKey,
  messages,
}: {
  apiKey: string;
  messages: AiMessage[];
}): Promise<string> => {
  const model = createAiModel(apiKey);
  const { text } = await generateText({
    model,
    messages,
  });
  return text.trim();
};
