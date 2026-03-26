#!/usr/bin/env node
import { Command } from 'commander';

import { commitAiCommand } from '@/commands/commitAi.js';
import { configCommand } from '@/commands/config.js';
import { featureCommand } from '@/commands/feature.js';
import { featureFlagCommand } from '@/commands/featureFlag.js';
import { modeCommand } from '@/commands/mode.js';
import { releaseCommand } from '@/commands/release.js';

const program = new Command();

program.name('axon').description('Personal workflow assistant').version('1.0.0');

program
  .command('feature')
  .alias('f')
  .description('Create a new feature branch')
  .action(featureCommand);

program
  .command('release')
  .alias('r')
  .description('Create a release branch')
  .option('--only-unmerged', 'Only show unmerged commits')
  .option('--author <author>', 'Filter by author')
  .action(releaseCommand);

program
  .command('commit-ai')
  .alias('ca')
  .description('Generate a commit message with AI')
  .action(commitAiCommand);

program.command('config').description('Manage API keys securely').action(configCommand);

program
  .command('feature-flag')
  .alias('ff')
  .description('Add a feature flag')
  .action(featureFlagCommand);

program
  .command('mode')
  .argument('<type>', 'jira | default')
  .description('Set CLI mode')
  .action(modeCommand);

program.parse(process.argv);

let isInterrupting = false;

process.on('SIGINT', () => {
  if (isInterrupting) return;
  isInterrupting = true;

  process.stdout.write('\n');
  process.stdout.write('Interrupted. Exiting…\n');

  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  if (err?.constructor?.name === 'ExitPromptError') {
    process.stdout.write('\nPrompt canceled. Exiting...\n');
    process.exit(1);
  }
});
