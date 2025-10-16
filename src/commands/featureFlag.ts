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

  const lines = content.split('\n');

  const featureFlagStart = lines.findIndex((l) => l.trim() === '# Feature Flags');
  const featureFlagEnd = lines.findIndex(
    (l, i) => i > featureFlagStart && l.trim().startsWith('#'),
  );

  // Extract the section
  const before = featureFlagStart >= 0 ? lines.slice(0, featureFlagStart + 1) : [];
  const after =
    featureFlagEnd >= 0 ? lines.slice(featureFlagEnd) : lines.slice(featureFlagStart + 1);

  let featureFlags: string[] = [];
  if (featureFlagStart >= 0) {
    featureFlags = lines
      .slice(featureFlagStart + 1, featureFlagEnd >= 0 ? featureFlagEnd : undefined)
      .filter(Boolean);

    // Update if key exists, otherwise add it
    let updated = false;
    featureFlags = featureFlags.map((line) => {
      const [existingKey] = line.split('=');
      if (existingKey === key) {
        updated = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!updated) {
      featureFlags.push(`${key}=${value}`);
    }

    // Sort alphabetically
    featureFlags.sort((a, b) => {
      const keyA = a.split('=')[0];
      const keyB = b.split('=')[0];
      return keyA.localeCompare(keyB);
    });
  } else {
    // If no Feature Flags section, create it
    before.push('# Feature Flags');
    featureFlags = [`${key}=${value}`];
  }

  const newContent = [...before, ...featureFlags, ...after].join('\n');
  fs.writeFileSync(filePath, newContent, 'utf-8');
  logger.info(`${key}=${value} written to ${filePath}`);
}

function updateFeatureFlagHelper(flagName: string) {
  const helperFile = path.resolve(process.cwd(), 'utils/helpers/feature-flag-helper.ts');
  if (!fs.existsSync(helperFile)) {
    logger.error('Feature flag helper file does not exist');
    return;
  }

  let content = fs.readFileSync(helperFile, 'utf-8');

  // Strip NEXT_PUBLIC_ if it exists
  const logicalName = flagName.replace(/^NEXT_PUBLIC_/, '');

  // 1️⃣ Update and sort the union type
  const unionRegex = /export type FeatureFlagName =([^;]+);/s;
  const match = content.match(unionRegex);
  if (match) {
    const unionBlock = match[1];
    let flags = unionBlock
      .split('|')
      .map((f) => f.trim().replace(/'/g, ''))
      .filter(Boolean);

    if (!flags.includes(logicalName)) {
      flags.push(logicalName);
    }

    // Sort alphabetically for union
    flags = flags.sort((a, b) => a.localeCompare(b));

    const newUnion = flags.map((f) => `  | '${f}'`).join('\n');
    content = content.replace(unionRegex, `export type FeatureFlagName =\n${newUnion};`);
    logger.success('Updated FeatureFlagName union (sorted)');
  }

  // 2️⃣ Update switch statement (preserve order + indentation)
  const switchRegex = /(switch\s*\(featureFlagName\)\s*{)([\s\S]*?)(\n\s*default:)/;
  const switchMatch = content.match(switchRegex);

  if (switchMatch) {
    const prefix = switchMatch[1];
    const casesBlock = switchMatch[2];
    const suffix = switchMatch[3];

    const caseRegex =
      /(\s*case\s+'([^']+)':\s*\n\s*return\s+process\.env\.NEXT_PUBLIC_[^']+ === 'true';)/g;

    const existingCases: string[] = [];
    let m;
    while ((m = caseRegex.exec(casesBlock)) !== null) {
      existingCases.push(m[1]);
    }

    // Skip if already exists
    if (casesBlock.includes(`case '${logicalName}':`)) {
      logger.info(`Case for ${logicalName} already exists.`);
    } else {
      // Detect indentation based on existing cases (default 4 spaces)
      const indent = (existingCases[0]?.match(/^\s*/) || ['    '])[0];

      // ✅ No blank line between case and return
      const newCase = `${indent}case '${logicalName}':\n${indent}  return process.env.NEXT_PUBLIC_${logicalName} === 'true';`;

      // Trim trailing spaces/newlines before inserting
      const newCasesBlock = casesBlock.trimEnd() + '\n' + newCase;
      content = content.replace(switchRegex, `${prefix}${newCasesBlock}${suffix}`);
      logger.success('Added new feature flag case (preserving order and indentation)');
    }
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

  const featureFlagRegex = /(\/\/ Feature Flags\s*\n)([\s\S]*?)(\n\s*\/\/ Public API Routes)/;
  const match = content.match(featureFlagRegex);

  if (!match) {
    logger.warn('Could not find Feature Flags section in global.d.ts');
    return;
  }

  const prefix = match[1];
  const block = match[2];
  const suffix = match[3];

  if (block.includes(flagName)) {
    logger.warn(`${flagName} already exists in global.d.ts`);
    return;
  }

  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  lines.push(`${flagName}: string;`);
  lines.sort((a, b) => a.localeCompare(b));

  const newBlock = lines.map((l) => `    ${l}`).join('\n');
  content = content.replace(featureFlagRegex, `${prefix}${newBlock}${suffix}`);

  fs.writeFileSync(globalFile, content, 'utf-8');
  logger.success(`Added ${flagName} to global.d.ts`);
}
