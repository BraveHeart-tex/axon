import chalk from 'chalk';

export interface HookDefinition {
  id: string;
  name: string;
  description: string;
  hookFile: string;
  script: string;
}

export const HOOKS: HookDefinition[] = [
  {
    id: 'block-amend',
    name: 'Block Amends on Release',
    hookFile: 'prepare-commit-msg',
    description: 'Prevents "git commit --amend" on release/* branches.',
    script: `
# Axon: Block Amend
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH_NAME" == release/* ]] && [ "$2" == "commit" ]; then
  echo -e "\\n\\033[31m[AXON] AMEND BLOCKED\\033[0m"
  echo -e "Please create a new commit instead.\\n"
  exit 1
fi`.trim(),
  },
  {
    id: 'suggest-sync',
    name: 'Suggest Sync-back',
    hookFile: 'post-commit',
    description: 'Reminds you to run "axon sync" after committing to release/.',
    script: `
# Axon: Suggest Sync
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH_NAME" == release/* ]]; then
  echo -e "\\n\\033[36m[AXON] TIP\\033[0m"
  echo -e "Run \\033[1;32maxon sync\\033[0m to backport this fix.\\n"
fi`.trim(),
  },
];

export const formatCodePane = (script: string) => {
  const lines = script.split('\n');
  const header = chalk.yellow('┌─── Source Code Preview ──────────────────────────');
  const footer = chalk.yellow('└──────────────────────────────────────────────────');

  const content = lines.map((line) => `${chalk.yellow('│')} ${chalk.dim(line)}`).join('\n');

  return `\n${header}\n${content}\n${footer}`;
};
