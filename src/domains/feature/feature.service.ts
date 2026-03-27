import c from 'ansi-colors';
import ora from 'ora';

import { logger } from '@/infra/logger.js';

import { checkoutAndCreateBranch, remoteBranchExists } from '../git/git.service.js';
import { getCliModeConfig } from '../mode/mode.service.js';
import { resolveBranchMeta } from './flows/resolveBranchMeta.flow.js';
import { resolveIssueKey } from './flows/resolveIssueKey.flow.js';

export const runFeatureFlow = async () => {
  const cliMode = getCliModeConfig();

  const [issueKey, baseBranch] = await Promise.all([
    resolveIssueKey(cliMode),
    remoteBranchExists('develop').then((exists) => (exists ? 'develop' : 'main')),
  ]);

  const { commitLabel, slug } = await resolveBranchMeta(issueKey);
  const branch = slug ? `${commitLabel}/${issueKey}-${slug}` : `${commitLabel}/${issueKey}`;

  console.log('');
  const spinner = ora(`Creating branch from ${c.bold(baseBranch)}...`).start();

  try {
    await checkoutAndCreateBranch(baseBranch, branch);

    spinner.succeed(`Branch created successfully!`);

    console.log(`\n  ${c.green('✔')} Ready: ${c.green.bold(branch)}\n`);
  } catch (error) {
    spinner.fail(`Git operation failed.`);
    logger.error((error as Error).message);
  }
};
