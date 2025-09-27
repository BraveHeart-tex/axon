import { getStagedChangesDiff } from '../utils/git.js';
import { getApiKey } from '../utils/config.js';
import { CREDENTIAL_KEYS } from '../constants/config.js';
import { streamAiResponse } from '../utils/ai.js';
import ora from 'ora';
import { getCommitMessagePrompt } from '../constants/prompts.js';

export const generateAICommit = async () => {
  try {
    const aiApiKey = await getApiKey(CREDENTIAL_KEYS.AI);
    // TODO: Trigger a set-command here to set the ai-key
    if (!aiApiKey) {
      console.error('❌ Groq API key is required to generate a commit message.');
      return;
    }

    const stagedChangesDiff = await getStagedChangesDiff();
    if (!stagedChangesDiff) {
      console.error('❌ No staged changes found.');
      return;
    }

    const spinner = ora('🤖 Generating commit message with AI...').start();

    let fullMessage = '';

    await streamAiResponse({
      apiKey: aiApiKey,
      prompt: getCommitMessagePrompt({ diff: stagedChangesDiff, inferredScope: '' }),
      onChunk: (chunk) => {
        fullMessage += chunk;
      },
    });

    fullMessage = fullMessage
      .replace(/\s+/g, ' ') // merge extra whitespace
      .split('\n')[0] // take only the first line
      .trim();

    spinner.stop();
    console.log('\n✨ Suggested commit message:\n');
    console.log(fullMessage);
  } catch (error) {
    console.error('An error occurred while generating commit message:', error);
  }
};
