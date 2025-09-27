import inquirer from 'inquirer';
import { execa } from 'execa';

const commitLabels = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'ci',
  'perf',
  'hotfix',
] as const;

type CommitLabel = (typeof commitLabels)[number];

const JIRA_REGEX = /^(FE|ORD|DIS|PE|PRD|MEM|MOD)-[0-9]+$/;

export const createFeatureBranch = async () => {
  const { commitLabel } = await inquirer.prompt<{ commitLabel: CommitLabel }>([
    {
      type: 'list',
      name: 'commitLabel',
      message: 'Select a branch type:',
      choices: commitLabels,
    },
  ]);

  const { jiraCode } = await inquirer.prompt<{ jiraCode: string }>([
    {
      type: 'input',
      name: 'jiraCode',
      message: 'Enter JIRA code (e.g., ORD-1325):',
      validate: (input: string) =>
        JIRA_REGEX.test(input)
          ? true
          : '❌ Invalid JIRA code. Must match FE|ORD|DIS|PE|PRD|MEM|MOD-[0-9]+',
    },
  ]);

  const { shortDesc } = await inquirer.prompt([
    {
      type: 'input',
      name: 'shortDesc',
      message: 'Optional short description (e.g., add-logging):',
    },
  ]);

  const slug = shortDesc
    ? shortDesc
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';

  const branch = slug ? `${commitLabel}/${jiraCode}-${slug}` : `${commitLabel}/${jiraCode}`;

  console.log('🔄 Checking out develop and pulling latest changes...');
  try {
    await execa('git', ['checkout', 'develop'], { stdio: 'inherit' });
    await execa('git', ['pull', 'origin', 'develop'], { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Failed to update develop branch:', err);
    return;
  }

  try {
    console.log(`🌿 Creating branch: ${branch}`);
    await execa('git', ['checkout', '-b', branch], { stdio: 'inherit' });
    console.log(`✅ Branch ${branch} created from develop`);
  } catch (err) {
    console.error('❌ Failed to create branch:', err);
  }
};
