import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

const createAiModel = (apiKey: string) => {
  const groq = createGroq({ apiKey });
  return groq('llama-3.3-70b-versatile');
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
    maxOutputTokens: 120,
    temperature: 0.2,
  });
  return text.trim();
};
