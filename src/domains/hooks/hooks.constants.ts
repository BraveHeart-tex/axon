import c from 'ansi-colors';

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
#!/bin/bash

# 1. Get the current branch name
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)

# 2. Check if we are on a release branch
if [ "\${BRANCH_NAME#release/}" != "$BRANCH_NAME" ]; then

    # 3. Check if the parent command was an 'amend'
    # We look at the actual command arguments used to invoke git
    if ps -p $PPID -o args= | grep -E -q -- '--amend'; then
        printf "\\n\\033[31m[AXON] AMEND BLOCKED\\033[0m\\n"
        printf "Amending commits on release branches is prohibited.\\n"
        printf "Please create a new commit instead.\\n\\n"
        exit 1
    fi
fi
`.trim(),
  },
  {
    id: 'suggest-sync',
    name: 'Suggest Sync-back',
    hookFile: 'post-commit',
    description: 'Reminds you to run "axon sync" after committing to release/.',
    script: `
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [ "\${BRANCH_NAME#release/}" != "$BRANCH_NAME" ]; then
  printf "\\n\\033[36m[AXON] TIP\\033[0m\\n"
  printf "Run \\033[1;32maxon sync\\033[0m to backport this fix.\\n\\n"
fi`.trim(),
  },
];

export const formatCodePane = (script: string) => {
  const lines = script.split('\n');
  const header = c.yellow('┌─── Source Code Preview ──────────────────────────');
  const footer = c.yellow('└──────────────────────────────────────────────────');

  const content = lines.map((line) => `${c.yellow('│')} ${c.dim(line)}`).join('\n');

  return `\n${header}\n${content}\n${footer}`;
};

export const getHookMarkers = (id: string) => ({
  start: `# AXON_START: ${id}`,
  end: `# AXON_END: ${id}`,
});

export const wrapScript = ({ id, script }: { id: string; script: string }) => {
  const { start, end } = getHookMarkers(id);
  return `\n${start}\n${script.trim()}\n${end}\n`;
};
