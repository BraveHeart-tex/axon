import { confirm, input, select } from '@inquirer/prompts';
import c from 'ansi-colors';
import ora from 'ora';

import { resolveAiModel } from '@/domains/ai/ai.config.js';
import { getCommitMessagePrompt } from '@/domains/ai/ai.prompts.js';
import { generateAiResponse } from '@/domains/ai/ai.service.js';
import { normalizeGeneratedCommitMessage } from '@/domains/ai/commit/commitMessageFormatter.js';
import { offerCommitFixup } from '@/domains/ai/commit/flows/commitFixup.flow.js';
import { ensureAiApiKey } from '@/domains/ai/commit/flows/ensureAiApiKey.flow.js';
import { resolveCommitContext } from '@/domains/ai/commit/flows/resolveCommitContext.flow.js';
import { commitWithMessage, pushCurrentBranch } from '@/domains/git/git.service.js';
import type { ProjectContext } from '@/domains/project/project.types.js';
import { registerCancellation } from '@/infra/cancellation.js';
import { logger } from '@/infra/logger.js';
import { editMessageInline } from '@/shared/editMessageInline.js';
export const runCommitAiFlow = async (projectContext: ProjectContext) => {
  try {
    if (await offerCommitFixup(projectContext)) return;

    const apiKey = await ensureAiApiKey();
    const context = await resolveCommitContext(projectContext);

    const rejectedMessages: string[] = [];
    let userFeedback: string | undefined = undefined;

    let message = '';

    while (true) {
      const spinner = ora('Generating commit message...').start();

      try {
        message = await generateMessage(
          projectContext,
          apiKey,
          context,
          rejectedMessages,
          userFeedback,
        );
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
        console.log('');
        continue;
      }

      if (action === 'edit') {
        const edited = await editMessageInline({
          initialText: message,
          prompt: '? Edit commit message: ',
        });

        if (!edited) {
          logger.error('Commit message cannot be empty.');
          continue;
        }
        message = edited;
      }

      await commitWithMessage(message);
      logger.info(`\n✔ Committed: ${message}\n`, false);

      const shouldPush = await confirm({
        message: 'Push to remote?',
        default: true,
        theme: { prefix: c.cyan('?') },
      });

      if (shouldPush) {
        logger.info('Checking origin and pushing with --force-with-lease');
        const cancellation = registerCancellation(async () => undefined);
        try {
          await pushCurrentBranch({ cancelSignal: cancellation.signal });
          logger.success('Pushed.');
        } finally {
          cancellation.unregister();
        }
      }

      return;
    }
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      logger.info('Commit canceled.');
      return;
    }
    process.exitCode = 1;
    logger.error(`Commit AI failed: ${error instanceof Error ? error.message : error}`);
  }
};

const generateMessage = async (
  projectContext: ProjectContext,
  apiKey: string,
  context: Awaited<ReturnType<typeof resolveCommitContext>>,
  previousMessages: string[] = [],
  feedback?: string,
): Promise<string> => {
  const raw = await generateAiResponse({
    apiKey,
    modelId: resolveAiModel(projectContext),
    ...getCommitMessagePrompt(context, previousMessages, feedback),
  });

  return normalizeGeneratedCommitMessage(raw, context);
};
