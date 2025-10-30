#!/usr/bin/env node
import { Command } from 'commander';
import { createFeatureBranch } from '../commands/feature.js';
import { createReleaseBranch } from '../commands/release.js';
import { configureApiKey } from '../commands/config.js';
import { generateAICommit } from '../commands/commitAi.js';
import { reviewAi } from '../commands/reviewAi.js';
import { searchCommits } from '../commands/searchCommits.js';
import { addFeatureFlag } from '../commands/featureFlag.js';

const program = new Command();

program.name('axon').description('Personal workflow assistant').version('1.0.0');

program
  .command('feature')
  .description('Create a new feature branch')
  .action(async () => {
    await createFeatureBranch();
  });

program
  .command('release')
  .description('Create a release branch')
  .action(async () => {
    await createReleaseBranch();
  });

program
  .command('commit-ai')
  .description('Generate a commit message with AI')
  .action(async () => {
    await generateAICommit();
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
    await reviewAi(diffContent);
  });

program
  .command('search-commits <jiraKey>')
  .description('Search commits by JIRA issue key')
  .action(async (jiraKey) => {
    await searchCommits(jiraKey);
  });

program
  .command('config')
  .description('Manage API keys securely')
  .action(async () => {
    await configureApiKey();
  });

program
  .command('feature-flag')
  .description('Add a feature flag')
  .action(async () => {
    await addFeatureFlag();
  });

program.parse(process.argv);
