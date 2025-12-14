#!/usr/bin/env node
import { Command } from 'commander';

import { commitAiCommand } from '../commands/commitAi.js';
import { configCommand } from '../commands/config.js';
import { featureCommand } from '../commands/feature.js';
import { featureFlagCommand } from '../commands/featureFlag.js';
import { modeCommand } from '../commands/mode.js';
import { releaseCommand, ReleaseOptions } from '../commands/release.js';
import { reviewAiCommand } from '../commands/reviewAi.js';
import { searchCommitsCommand } from '../commands/searchCommits.js';

const program = new Command();

program.name('axon').description('Personal workflow assistant').version('1.0.0');

program
  .command('feature')
  .description('Create a new feature branch')
  .action(async () => {
    await featureCommand();
  });

program
  .command('release')
  .description('Create a release branch')
  .option('--only-unmerged', 'Only show unmerged commits')
  .option('--author <author>', 'Filter by author')
  .action(async (options: ReleaseOptions) => {
    await releaseCommand(options);
  });

program
  .command('commit-ai')
  .description('Generate a commit message with AI')
  .action(async () => {
    await commitAiCommand();
  });

program
  .command('review-ai')
  .description('Generate a code review with ai')
  .option('--diff <diff>', 'Provide diff inline')
  .option('--diff-file <path>', 'Provide path to diff file')
  .action(async (options) => {
    let diffContent = '';

    if (options.diff) {
      diffContent = options.diff;
    } else if (options.diffFile) {
      const fs = await import('fs');
      diffContent = fs.readFileSync(options.diffFile, 'utf-8');
    }
    await reviewAiCommand(diffContent);
  });

program
  .command('search-commits <jiraKey>')
  .description('Search commits by JIRA issue key')
  .action(async (jiraKey) => {
    await searchCommitsCommand(jiraKey);
  });

program
  .command('config')
  .description('Manage API keys securely')
  .action(async () => {
    await configCommand();
  });

program
  .command('feature-flag')
  .description('Add a feature flag')
  .action(async () => {
    await featureFlagCommand();
  });

program
  .command('mode')
  .argument('<type>', 'jira | default')
  .description('Set CLI mode')
  .action(async (type) => {
    await modeCommand(type);
  });

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
