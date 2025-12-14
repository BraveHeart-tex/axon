import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

import { logger } from '../../../infra/logger.js';

export const updateGitlabCI = (flagName: string, stagingValue: string, productionValue: string) => {
  const ciFile = path.resolve(process.cwd(), '.gitlab-ci.yml');
  if (!fs.existsSync(ciFile)) {
    logger.error('.gitlab-ci.yml file does not exist');
    return;
  }

  const raw = fs.readFileSync(ciFile, 'utf-8');
  const doc = yaml.parseDocument(raw);

  const envVar = `NEXT_PUBLIC_${flagName.replace(/^NEXT_PUBLIC_/, '')}`;
  const buildNode = doc.get('build') as yaml.YAMLMap | undefined;

  if (!buildNode) {
    logger.error('No build job found in .gitlab-ci.yml');
    return;
  }

  const rulesNode = buildNode.get('rules') as yaml.YAMLSeq | undefined;
  if (!rulesNode) {
    logger.error('No build.rules found in .gitlab-ci.yml');
    return;
  }

  let changed = false;

  for (const item of rulesNode.items) {
    if (!item || !yaml.isMap(item)) continue;
    const ifCond = item.get('if') as string;
    if (!ifCond) continue;

    const isDevelop =
      ifCond.includes('develop') ||
      ifCond.includes('merge_request_target_branch_name == "develop"');
    const isMain =
      ifCond.includes('main') || ifCond.includes('merge_request_target_branch_name == "main"');

    if (!isDevelop && !isMain) continue;

    const desiredValue = isDevelop ? stagingValue : productionValue;
    let vars = item.get('variables') as yaml.YAMLMap | undefined;

    if (!vars) {
      vars = new yaml.YAMLMap();
      item.set('variables', vars);
      changed = true;
    }

    const existing = vars.get(envVar);
    if (existing !== desiredValue) {
      vars.set(envVar, desiredValue);
      changed = true;
    }

    // Sort variables alphabetically
    const sorted = new yaml.YAMLMap();
    [...(vars.items as yaml.Pair[])]
      .sort((a, b) => String(a.key).localeCompare(String(b.key), 'en', { sensitivity: 'base' }))
      .forEach((p) => sorted.add(p));
    item.set('variables', sorted);
  }

  if (!changed) {
    logger.info(`No changes required for ${envVar}`);
    return;
  }

  const updatedYaml = doc.toString();
  fs.writeFileSync(ciFile, updatedYaml, 'utf-8');
  logger.success(`✅ Updated build.rules with ${envVar}`);
};
