import c from 'ansi-colors';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

export const installHooks = async () => {
  try {
    const { stdout: gitDir } = await execa('git', ['rev-parse', '--git-path', 'hooks']);
    const hookPath = path.resolve(gitDir, 'prepare-commit-msg');

    const hookScript = `#!/bin/bash
# Installed by Axon
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH_NAME" == release/* ]] && [ "$2" == "commit" ]; then
  echo -e "\\n\\033[31m[AXON] AMEND BLOCKED\\033[0m"
  echo -e "Amending is disabled on release branches to support sync-back workflows."
  echo -e "Please create a new commit instead.\\n"
  exit 1
fi
`;

    fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });

    console.log(`${c.green('✔')} Axon protection hooks installed in this repository.`);
  } catch {
    console.error(c.red('Failed to install hooks. Are you in a git repository?'));
  }
};
