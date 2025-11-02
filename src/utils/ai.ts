import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

export const createAiModel = (apiKey: string) => {
  const groq = createGroq({ apiKey });
  return groq('openai/gpt-oss-20b');
};

export const streamAiResponse = async ({
  apiKey,
  onChunk,
  prompt,
}: {
  apiKey: string;
  prompt: string;
  onChunk: (chunk: string) => void;
}) => {
  const model = createAiModel(apiKey);

  const { textStream } = streamText({
    model,
    prompt,
  });

  for await (const textPart of textStream) {
    onChunk(textPart);
  }
};
