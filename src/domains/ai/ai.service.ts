import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

const createAiModel = (apiKey: string) => {
  const groq = createGroq({ apiKey });
  return groq('openai/gpt-oss-20b');
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
