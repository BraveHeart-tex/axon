import path from 'path';
import fs from 'fs';
import { logger } from '../logger.js';

export const updateFeatureFlagHelper = (flagName: string) => {
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
};
