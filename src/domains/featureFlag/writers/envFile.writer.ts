import fs from 'fs';

import { logger } from '../../../infra/logger.js';

export const writeEnvFile = (filePath: string, key: string, value: string) => {
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
};
