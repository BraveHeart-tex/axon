import path from 'node:path';

import { updateDockerfileFeatureFlag } from './writers/dockerfile.writer.js';
import { updateGlobalDts } from './writers/dts.writer.js';
import { writeEnvFile } from './writers/envFile.writer.js';
import { updateGitlabCI } from './writers/gitlabCi.writer.js';
import { updateFeatureFlagHelper } from './writers/tsHelper.writer.js';

export interface CreateFeatureFlagInput {
  name: string;
  staging: 'true' | 'false';
  preprod: 'true' | 'false';
  production: 'true' | 'false';
}

export const createFeatureFlag = ({
  name,
  staging,
  preprod,
  production,
}: CreateFeatureFlagInput) => {
  const cwd = process.cwd();

  const stagingFile = path.resolve(cwd, '.env.development.staging');
  const prodFile = path.resolve(cwd, '.env.development.production');

  writeEnvFile(stagingFile, name, staging);

  const prodValue = production === 'true' || preprod === 'true' ? 'true' : 'false';

  writeEnvFile(prodFile, name, prodValue);

  updateFeatureFlagHelper(name);
  updateGlobalDts(name);
  updateGitlabCI(name, staging, prodValue);
  updateDockerfileFeatureFlag(name);
};
