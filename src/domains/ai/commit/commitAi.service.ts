import { execa } from 'execa';
import inquirer from 'inquirer';
import ora from 'ora';

import { logger } from '@/infra/logger.js';

import { getCommitMessagePrompt } from '../ai.prompts.js';
import { generateAiResponse } from '../ai.service.js';
import { ensureAiApiKey } from './flows/ensureAiApiKey.flow.js';
import { resolveCommitContext } from './flows/resolveCommitContext.flow.js';

export const generateMessage = async (
  apiKey: string,
  context: Awaited<ReturnType<typeof resolveCommitContext>>,
): Promise<string> => {
  const raw = await generateAiResponse({
    apiKey,
    messages: getCommitMessagePrompt(context),
  });

  const base = raw
    .split('\n')[0]
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim();

  if (context.inferredScope && !base.includes(context.inferredScope)) {
    return base.replace(/^(\w+):/, `$1(${context.inferredScope}):`);
  }

  return base;
};

const commitWithMessage = async (message: string): Promise<void> => {
  await execa('git', ['commit', '-m', message], { stdio: 'inherit' });
};

const pushCurrentBranch = async (): Promise<void> => {
  await execa('git', ['push'], { stdio: 'inherit' });
};

export const runCommitAiFlow = async () => {
  try {
    const apiKey = await ensureAiApiKey();
    const context = await resolveCommitContext();

    let message = '';

    while (true) {
      const spinner = ora('Generating commit message...').start();

      try {
        message = await generateMessage(apiKey, context);
        spinner.stop();
      } catch (error) {
        spinner.fail('Generation failed');
        throw error;
      }

      logger.info(`\n  ${message}\n`, false);

      const { action } = await inquirer.prompt<{
        action: 'commit' | 'edit' | 'regenerate' | 'quit';
      }>([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Accept & commit', value: 'commit' },
            { name: 'Edit message', value: 'edit' },
            { name: 'Regenerate', value: 'regenerate' },
            { name: 'Quit', value: 'quit' },
          ],
        },
      ]);

      if (action === 'quit') {
        logger.info('Aborted.', false);
        return;
      }

      if (action === 'regenerate') {
        continue;
      }

      if (action === 'edit') {
        const { edited } = await inquirer.prompt<{ edited: string }>([
          {
            type: 'input',
            name: 'edited',
            message: 'Edit commit message:',
            default: message,
            validate: (input) => input.trim().length > 0 || 'Commit message cannot be empty.',
          },
        ]);
        message = edited.trim();
      }

      // commit
      await commitWithMessage(message);
      logger.info(`\n✔ Committed: ${message}\n`, false);

      // offer to push
      const { shouldPush } = await inquirer.prompt<{ shouldPush: boolean }>([
        {
          type: 'confirm',
          name: 'shouldPush',
          message: 'Push to remote?',
          default: true,
        },
      ]);

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
