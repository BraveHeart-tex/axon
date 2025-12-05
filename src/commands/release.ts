import inquirer from 'inquirer';

import { JIRA_REGEX } from '../constants/jira.js';
import {
  checkoutBranch,
  cherryPickCommit,
  createBranch,
  getRecentCommitsForDevelop,
  pullBranch,
} from '../utils/git.js';
import { logger } from '../utils/logger.js';

export const createReleaseBranch = async () => {
  const { jiraCode } = await inquirer.prompt<{ jiraCode: string }>([
    {
      type: 'input',
      name: 'jiraCode',
      message: 'Enter JIRA code (e.g., JIRA-123):',
      validate: (input: string) =>
        JIRA_REGEX.test(input)
          ? true
          : '❌ Invalid JIRA code. Must match FE|ORD|DIS|PE|PRD|MEM|MOD-[0-9]+',
    },
  ]);

  const branch = `release/${jiraCode}`;

  const { pickMethod } = await inquirer.prompt<{ pickMethod: 'manual' | 'list' }>([
    {
      type: 'list',
      name: 'pickMethod',
      message: 'How do you want to select commits?',
      choices: [
        { name: 'Paste commit hashes manually', value: 'manual' },
        { name: 'Select from recent commits', value: 'list' },
      ],
    },
  ]);

  let commits: string[] = [];

  if (pickMethod === 'manual') {
    const { commitHashes } = await inquirer.prompt<{ commitHashes: string }>([
      {
        type: 'input',
        name: 'commitHashes',
        message: 'Paste the commit hashes (space-separated):',
        validate: (input) => input.trim() !== '' || '❌ At least one commit hash is required.',
      },
    ]);

    commits = commitHashes.split(/\s+/);
  } else {
    logger.info('🔄 Checking out develop and pulling latest changes...');
    await checkoutBranch('develop');
    await pullBranch('develop');

    const recentCommits = await getRecentCommitsForDevelop();

    const { selectedCommits } = await inquirer.prompt<{ selectedCommits: string[] }>([
      {
        type: 'checkbox',
        name: 'selectedCommits',
        message: 'Select commits to cherry-pick:',
        choices: recentCommits,
        validate: (input) => input.length > 0 || '❌ Select at least one commit.',
      },
    ]);

    commits = selectedCommits;
  }

  try {
    logger.info('🔄 Checking out main and pulling latest changes...');
    await checkoutBranch('main');
    await pullBranch('main');

    logger.info(`🌿 Creating release branch: ${branch}`);
    await createBranch(branch);

    logger.info('🍒 Cherry-picking commits:');
    for (const commit of commits) {
      logger.info(`- ${commit}`);
      try {
        await cherryPickCommit(commit);
      } catch {
        logger.error(`Cherry-pick failed on commit ${commit}`);
        return;
      }
    }

    logger.info(`✅ Release branch ${branch} created and commits cherry-picked.`);
  } catch (err) {
    logger.error(`Git operation failed: ${(err as Error).message}`);
  }
};
