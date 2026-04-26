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

export interface AiGenerationOptions {
  maxOutputTokens?: number;
  temperature?: number;
}

export const generateAiResponse = async ({
  apiKey,
  messages,
  options,
}: {
  apiKey: string;
  messages: AiMessage[];
  options?: AiGenerationOptions;
}): Promise<string> => {
  const model = createAiModel(apiKey);
  const { text } = await generateText({
    model,
    messages,
    maxOutputTokens: options?.maxOutputTokens ?? 120,
    temperature: options?.temperature ?? 0.2,
  });
  return text.trim();
};
