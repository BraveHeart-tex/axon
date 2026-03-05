import { createGroq } from '@ai-sdk/groq';
import { generateText, streamText } from 'ai';

const createAiModel = (apiKey: string) => {
  const groq = createGroq({ apiKey });
  return groq('moonshotai/kimi-k2-instruct');
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

interface StreamAiResponseOptions {
  apiKey: string;
  prompt: string;
  onChunk: (chunk: string) => void;
}

export const streamAiResponse = async ({ apiKey, onChunk, prompt }: StreamAiResponseOptions) => {
  const model = createAiModel(apiKey);

  const { textStream } = streamText({
    model,
    prompt,
  });

  for await (const textPart of textStream) {
    onChunk(textPart);
  }
};
