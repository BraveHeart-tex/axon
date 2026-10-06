import { JIRA_PROJECT_LABELS } from '@/domains/jira/jira.constants.js';
import type { FlowName, ProjectContext } from '@/domains/project/project.types.js';

export interface HookDefinition {
  id: string;
  flows: FlowName[];
  name: string;
  description: string;
  hookFile: string;
  script: string;
}

const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export const buildHookCatalog = (
  context: Pick<ProjectContext, 'flow' | 'jira'>,
): HookDefinition[] => {
  const JIRA_LABEL_PATTERN = context.jira.projectKeys.join('|');
  const releasePrefix = context.flow.name === 'gitflow' ? context.flow.releasePrefix : 'release/';
  return [
    {
      id: 'block-amend',
      flows: ['gitflow'],
      name: 'Block Amends on Release',
      hookFile: 'prepare-commit-msg',
      description: `Stop amended commits on ${releasePrefix}* branches.`,
      script: `
#!/bin/bash

RELEASE_PREFIX=${shellQuote(releasePrefix)}
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)

if [ "\${BRANCH_NAME#"$RELEASE_PREFIX"}" != "$BRANCH_NAME" ]; then

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
      id: 'warn-jira-mismatch',
      flows: ['gitflow', 'classified'],
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
};

export const HOOKS = buildHookCatalog({
  flow: {
    name: 'gitflow',
    mainBranch: 'main',
    developBranch: 'develop',
    releasePrefix: 'release/',
  },
  jira: {
    projectKeys: [...JIRA_PROJECT_LABELS],
    inProgressStatus: '',
    statusOrder: [],
    jql: '',
    cloudUrl: '',
    email: '',
  },
});

export const getHookMarkers = (id: string) => ({
  start: `# AXON_START: ${id}`,
  end: `# AXON_END: ${id}`,
});

export const wrapScript = ({ id, script }: { id: string; script: string }) => {
  const { start, end } = getHookMarkers(id);
  return `\n${start}\n${script.trim()}\n${end}\n`;
};
