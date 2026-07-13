import { JIRA_PROJECT_LABELS } from '@/domains/jira/jira.constants.js';

export interface HookDefinition {
  id: string;
  name: string;
  description: string;
  hookFile: string;
  script: string;
}

const JIRA_LABEL_PATTERN = JIRA_PROJECT_LABELS.join('|');

export const HOOKS: HookDefinition[] = [
  {
    id: 'block-amend',
    name: 'Block Amends on Release',
    hookFile: 'prepare-commit-msg',
    description: 'Stop amended commits on release/* branches.',
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
    description: 'Remind me to run "axon sync" after a release/* commit.',
    script: `
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [ "\${BRANCH_NAME#release/}" != "$BRANCH_NAME" ]; then
  printf "\\n\\033[36m[AXON] TIP\\033[0m\\n"
  printf "Run \\033[1;32maxon sync\\033[0m to backport this fix.\\n\\n"
fi`.trim(),
  },
  {
    id: 'warn-jira-mismatch',
    name: 'Warn on Jira Mismatch',
    hookFile: 'commit-msg',
    description: 'Highlight Jira key differences between the branch and commit message.',
    script: `
COMMIT_MESSAGE_FILE=$1

if [ -z "$COMMIT_MESSAGE_FILE" ]; then
  exit 0
fi

BRANCH_NAME=$(git symbolic-ref --quiet --short HEAD 2>/dev/null) || exit 0

if git rev-parse --verify --quiet MERGE_HEAD >/dev/null 2>&1; then
  exit 0
fi

extract_jira_key() {
  printf '%s\\n' "$1" |
    grep -Eo '(^|[^[:alnum:]_])(${JIRA_LABEL_PATTERN})-[0-9]+([^[:alnum:]_]|$)' |
    head -n 1 |
    grep -Eo '(${JIRA_LABEL_PATTERN})-[0-9]+'
}

COMMIT_MESSAGE=$(cat "$COMMIT_MESSAGE_FILE" 2>/dev/null) || exit 0
BRANCH_JIRA_KEY=$(extract_jira_key "$BRANCH_NAME") || true
COMMIT_JIRA_KEY=$(extract_jira_key "$COMMIT_MESSAGE") || true

if [ "$BRANCH_JIRA_KEY" != "$COMMIT_JIRA_KEY" ]; then
  printf "\\n\\033[30;103m  ⚠  AXON · JIRA MISMATCH  \\033[0m\\n\\n"
  printf "  Branch Jira key: %s\\n" "\${BRANCH_JIRA_KEY:-none}"
  printf "  Commit Jira key: %s\\n" "\${COMMIT_JIRA_KEY:-none}"
  printf "\\n  \\033[1;33mCommit will continue.\\033[0m Verify the branch name or commit message.\\n\\n"
fi

exit 0`.trim(),
  },
];

export const getHookMarkers = (id: string) => ({
  start: `# AXON_START: ${id}`,
  end: `# AXON_END: ${id}`,
});

export const wrapScript = ({ id, script }: { id: string; script: string }) => {
  const { start, end } = getHookMarkers(id);
  return `\n${start}\n${script.trim()}\n${end}\n`;
};
