import inquirer, { DistinctQuestion } from 'inquirer';

import path from 'path';
import { writeEnvFile } from '../utils/featureFlag/writeEnvFile.js';
import { updateFeatureFlagHelper } from '../utils/featureFlag/updateFeatureFlagHelper.js';
import { updateGlobalDts } from '../utils/featureFlag/updateGlobalDts.js';
import { updateGitlabCI } from '../utils/featureFlag/updateGitlabCi.js';
import { updateDockerfileFeatureFlag } from '../utils/featureFlag/updateDockerFileFeatureFlag.js';

export const addFeatureFlag = async () => {
  const questions: DistinctQuestion[] = [
    {
      type: 'input',
      name: 'name',
      message: 'Feature flag variable name (e.g., ENABLE_NEW_DASHBOARD):',
      validate: (v) => !!v || 'Name required',
      filter: (v) => (v.startsWith('NEXT_PUBLIC') ? v : `NEXT_PUBLIC_${v}`),
    },
    {
      name: 'staging',
      message: 'Staging value (true/false):',
      type: 'list' as const,
      choices: ['true', 'false'] as const,
    },
    {
      name: 'preprod',
      message: 'Preprod value (true/false):',
      type: 'list' as const,
      choices: ['true', 'false'] as const,
    },
    {
      name: 'production',
      message: 'Production value (true/false):',
      type: 'list' as const,
      choices: ['true', 'false'] as const,
    },
  ];

  const answers = await inquirer.prompt(questions);

  const stagingFile = path.resolve(process.cwd(), '.env.development.staging');
  const prodFile = path.resolve(process.cwd(), '.env.development.production');

  writeEnvFile(stagingFile, answers.name, answers.staging);

  const prodValue = answers.production === 'true' || answers.preprod === 'true' ? 'true' : 'false';
  writeEnvFile(prodFile, answers.name, prodValue);

  updateFeatureFlagHelper(answers.name);
  updateGlobalDts(answers.name);
  updateGitlabCI(answers.name, answers.staging, prodValue);
  updateDockerfileFeatureFlag(answers.name);
};
