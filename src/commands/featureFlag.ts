import inquirer, { DistinctQuestion } from 'inquirer';

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

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

  // Write staging variable
  writeEnvFile(stagingFile, answers.name, answers.staging);

  // For preprod and production, merge into single env file
  const prodValue = answers.production === 'true' || answers.preprod === 'true' ? 'true' : 'false';
  writeEnvFile(prodFile, answers.name, prodValue);

  updateFeatureFlagHelper(answers.name);
  updateGlobalDTS(answers.name);
};

function writeEnvFile(filePath: string, key: string, value: string) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  const lines = content.split('\n').filter(Boolean);
  let updated = false;

  const newLines = lines.map((line) => {
    const [existingKey] = line.split('=');
    if (existingKey === key) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!updated) {
    newLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, newLines.join('\n') + '\n');
  logger.info(`${key}=${value} written to ${filePath}`);
}

function updateFeatureFlagHelper(flagName: string) {
  const helperFile = path.resolve(process.cwd(), 'utils/helpers/feature-flag-helper.ts');
  if (!fs.existsSync(helperFile)) {
    logger.error('Feature flag helper file does not exist');
    return;
  }

  let content = fs.readFileSync(helperFile, 'utf-8');

  // 1️⃣ Update and sort the union type
  const unionRegex = /export type FeatureFlagName =([^;]+);/s;
  const match = content.match(unionRegex);
  if (match) {
    const unionBlock = match[1];
    let flags = unionBlock
      .split('|')
      .map((f) => f.trim().replace(/'/g, ''))
      .filter(Boolean);

    if (!flags.includes(flagName)) {
      flags.push(flagName);
    }

    // Sort alphabetically
    flags = flags.sort((a, b) => a.localeCompare(b));
    const newUnion = flags.map((f) => `  | '${f}'`).join('\n');
    content = content.replace(unionRegex, `export type FeatureFlagName =\n${newUnion};`);
    logger.success('Updated FeatureFlagName union (sorted)');
  }

  // 2️⃣ Update and sort the switch statement
  const switchRegex = /(switch\s*\(featureFlagName\)\s*{)([\s\S]*?)(\n\s*default:)/;
  const switchMatch = content.match(switchRegex);

  if (switchMatch) {
    const prefix = switchMatch[1]; // "switch(featureFlagName) {"
    const casesBlock = switchMatch[2]; // existing cases
    const suffix = switchMatch[3]; // "\n default:"

    // Parse existing cases into array
    const caseRegex =
      /case\s+'([^']+)':\s*\n\s*return\s+process\.env\.NEXT_PUBLIC_[^']+ === 'true';/g;
    const existingCases: string[] = [];
    let m;
    while ((m = caseRegex.exec(casesBlock)) !== null) {
      existingCases.push(m[0]);
    }

    // Add the new case if it doesn’t exist
    const newCase = `case '${flagName}':\n  return process.env.NEXT_PUBLIC_${flagName} === 'true';`;
    if (!existingCases.includes(newCase)) {
      existingCases.push(newCase);
    }

    const newCasesBlock = '\n' + existingCases.join('\n') + '\n';
    content = content.replace(switchRegex, `${prefix}${newCasesBlock}${suffix}`);
    logger.success('Updated isFeatureFlagEnabled switch (sorted)');
  }

  fs.writeFileSync(helperFile, content, 'utf-8');
}
function updateGlobalDTS(flagName: string) {
  const globalFile = path.resolve(process.cwd(), 'global.d.ts');
  if (!fs.existsSync(globalFile)) {
    logger.warn('global.d.ts file does not exist');
    return;
  }

  let content = fs.readFileSync(globalFile, 'utf-8');

  const envVarName = `NEXT_PUBLIC_${flagName}`;

  // Regex to find the Feature Flags block
  const featureFlagRegex = /(\/\/ Feature Flags\s*\n)([\s\S]*?)(\n\s*\/\/ Public API Routes)/;
  const match = content.match(featureFlagRegex);

  if (!match) {
    logger.warn('Could not find Feature Flags section in global.d.ts');
    return;
  }

  const prefix = match[1];
  const block = match[2];
  const suffix = match[3];

  // Check if variable already exists
  if (block.includes(envVarName)) {
    logger.warn(`${envVarName} already exists in global.d.ts`);
    return;
  }

  // Add new variable and sort alphabetically
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  lines.push(`${envVarName}: string;`);
  lines.sort((a, b) => a.localeCompare(b));

  const newBlock = '\n' + lines.map((l) => `    ${l}`).join('\n') + '\n';
  content = content.replace(featureFlagRegex, `${prefix}${newBlock}${suffix}`);

  fs.writeFileSync(globalFile, content, 'utf-8');
  logger.success(`Added ${envVarName} to global.d.ts`);
}
