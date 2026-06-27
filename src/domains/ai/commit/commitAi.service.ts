import readline from 'node:readline';

import { confirm, input, select } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora from 'ora';

import { commitWithMessage, pushCurrentBranch } from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

import { getCommitMessagePrompt } from '../ai.prompts.js';
import { generateAiResponse } from '../ai.service.js';
import { normalizeGeneratedCommitMessage } from './commitMessageFormatter.js';
import { ensureAiApiKey } from './flows/ensureAiApiKey.flow.js';
import { resolveCommitContext } from './flows/resolveCommitContext.flow.js';

export const runCommitAiFlow = async () => {
  try {
    const apiKey = await ensureAiApiKey();
    const context = await resolveCommitContext();

    // State for making regenerate smarter
    const rejectedMessages: string[] = [];
    let userFeedback: string | undefined = undefined;

    let message = '';

    while (true) {
      const spinner = ora('Generating commit message...').start();

      try {
        message = await generateMessage(apiKey, context, rejectedMessages, userFeedback);
        spinner.stop();
      } catch (error) {
        spinner.fail('Generation failed');
        throw error;
      }

      logger.info(`\n  ${message}\n`, false);

      const action = await select<'commit' | 'edit' | 'regenerate' | 'quit'>({
        message: 'What would you like to do?',
        choices: [
          { name: 'Accept & commit', value: 'commit' },
          { name: 'Edit message', value: 'edit' },
          { name: 'Regenerate', value: 'regenerate' },
          { name: 'Quit', value: 'quit' },
        ],
        theme: {
          prefix: c.cyan('?'),
          icon: { cursor: c.cyan('❯') },
          style: {
            highlight: (text: string) => c.cyan.bold(text),
          },
        },
      });

      if (action === 'quit') {
        logger.info('Aborted.', false);
        return;
      }

      if (action === 'regenerate') {
        rejectedMessages.push(message);

        const hint = await input({
          message: `Any specific instructions? ${c.dim('(Optional, press Enter to just try again)')}`,
        });

        userFeedback = hint.trim() || undefined;
        console.log(''); // Visual padding
        continue;
      }

      if (action === 'edit') {
        const edited = await editMessageInline(message);

        if (!edited) {
          logger.error('Commit message cannot be empty.');
          continue;
        }
        message = edited;
      }

      // commit
      await commitWithMessage(message);
      logger.info(`\n✔ Committed: ${message}\n`, false);

      const shouldPush = await confirm({
        message: 'Push to remote?',
        default: true,
        theme: { prefix: c.cyan('?') },
      });

      if (shouldPush) {
        const pushSpinner = ora('Pushing...').start();
        try {
          await pushCurrentBranch();
          pushSpinner.succeed('Pushed.');
        } catch (error) {
          pushSpinner.fail('Push failed.');
          throw error;
        }
      }

      return;
    }
  } catch (error) {
    logger.error(`Commit AI failed: ${error instanceof Error ? error.message : error}`);
  }
};

const generateMessage = async (
  apiKey: string,
  context: Awaited<ReturnType<typeof resolveCommitContext>>,
  previousMessages: string[] = [],
  feedback?: string,
): Promise<string> => {
  const raw = await generateAiResponse({
    apiKey,
    messages: getCommitMessagePrompt(context, previousMessages, feedback),
  });

  return normalizeGeneratedCommitMessage(raw, context);
};

const editMessageInline = (initialText: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '? Edit commit message: ',
      terminal: true,
    });

    rl.on('SIGINT', () => {
      rl.close();
      process.exit(0);
    });

    rl.once('line', (line) => {
      rl.close();
      resolve(line.trim());
    });

    rl.prompt(true);
    rl.write(initialText);
  });
