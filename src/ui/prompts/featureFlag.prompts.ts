import inquirer from 'inquirer';

export interface FeatureFlagPromptResult {
  name: string;
  staging: 'true' | 'false';
  preprod: 'true' | 'false';
  production: 'true' | 'false';
}

export const promptFeatureFlag = () =>
  inquirer.prompt<FeatureFlagPromptResult>([
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
      type: 'list',
      choices: ['true', 'false'],
    },
    {
      name: 'preprod',
      message: 'Preprod value (true/false):',
      type: 'list',
      choices: ['true', 'false'],
    },
    {
      name: 'production',
      message: 'Production value (true/false):',
      type: 'list',
      choices: ['true', 'false'],
    },
  ]);
