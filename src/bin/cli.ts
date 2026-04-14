#!/usr/bin/env node
import { Command } from 'commander';

import { commitAiCommand } from '@/commands/commitAi.js';
import { configCommand } from '@/commands/config.js';
import { featureCommand } from '@/commands/feature.js';
import { modeCommand } from '@/commands/mode.js';
import { releaseCommand } from '@/commands/release.js';
import { runHooksFlow } from '@/domains/hooks/hooks.flow.js';
import { runSyncFlow } from '@/domains/release/sync/sync.flow.js';
import { AXON_LOGO } from '@/misc/logo.js';

const program = new Command();

program.name('axon').description('Personal workflow assistant').version('1.0.0');

program.addHelpText('before', AXON_LOGO);
program.addHelpText('afterAll', ' ');

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
  .command('mode')
  .argument('<type>', 'jira | default')
  .description('Set CLI mode')
  .action(modeCommand);

program
  .command('hooks')
  .alias('h')
  .description('Manage Git hooks to protect release branches and automate sync reminders')
  .action(async () => {
    await runHooksFlow();
  });

program
  .command('sync')
  .alias('s')
  .description('Sync fix commits from a release branch back to develop')
  .action(runSyncFlow);

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
