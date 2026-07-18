import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

import { AI_MODELS } from '@/domains/ai/ai.constants.js';

import { resolveAiModel } from './ai.config.js';

const createAiModel = (apiKey: string) => {
  const groq = createGroq({ apiKey });
  const modelId = resolveAiModel();

  return {
    model: groq(modelId),
    modelId,
  };
};

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const getGroqOptions = (
  modelId: string,
): Parameters<typeof generateText>[0]['providerOptions'] | undefined => {
  switch (modelId) {
    case AI_MODELS.GPT_OSS_120B:
    case AI_MODELS.GPT_OSS_20B:
      return {
        groq: {
          reasoningEffort: 'low',
        },
      };

    case AI_MODELS.QWEN3_6_27B:
      return {
        groq: {
          reasoningEffort: 'none',
        },
      };

    default:
      return undefined;
  }
};

export const generateAiResponse = async ({
  apiKey,
  messages,
}: {
  apiKey: string;
  messages: AiMessage[];
}): Promise<string> => {
  const { model, modelId } = createAiModel(apiKey);

  const { text } = await generateText({
    model,
    messages,
    temperature: 0.2,

    // Includes room for GPT-OSS reasoning tokens.
    // The final commit message is still capped during normalization.
    maxOutputTokens: 512,

    providerOptions: getGroqOptions(modelId),
  });

  return text.trim();
};
