#!/usr/bin/env node
import { Command } from 'commander';
import { createFeatureBranch } from '../commands/feature.js';
import { createReleaseBranch } from '../commands/release.js';

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

program.parse(process.argv);
