import c from 'ansi-colors';
import ora from 'ora';

import { copyToClipboard } from '@/infra/clipboard.js';
import { logger } from '@/infra/logger.js';

import { createMergeRequestUrl, isGitLabProject } from '../mr.service.js';

interface GenerateAndCopyMrParams {
  sourceBranch: string;
  targetBranch: 'main' | 'develop' | (string & {});
}

export const handleMrUrlGeneration = async ({
  sourceBranch,
  targetBranch,
}: GenerateAndCopyMrParams) => {
  const spinner = ora('Generating GitLab MR URL...').start();

  try {
    const { isGitlab, url } = await isGitLabProject();

    if (!isGitlab || !url) {
      spinner.warn('Not a GitLab project — skipping MR URL generation.');
      return null;
    }

    const mrUrl = createMergeRequestUrl({
      remoteOriginUrl: url,
      sourceBranch,
      targetBranch,
    });

    await copyToClipboard(mrUrl);

    spinner.succeed('MR URL copied to clipboard.');

    console.log('');
    logger.info(`MR URL:`);
    console.log(c.cyan(`  ${mrUrl}`));
    console.log('');

    return mrUrl;
  } catch {
    spinner.fail('Failed to generate MR URL.');
    // We don't necessarily want to crash the whole app if clipboard/URL fails
    return null;
  }
};
