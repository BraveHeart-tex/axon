import { AiMessage } from './ai.service.js';
import { CommitContext } from './commit/flows/resolveCommitContext.flow.js';

export const getCommitMessagePrompt = (
  context: CommitContext,
  previousMessages: string[] = [],
  feedback?: string,
): AiMessage[] => [
  {
    role: 'system',
    content: `
You are an expert developer writing Conventional Commit messages.
Your job is to describe WHY a change exists or WHAT problem it solves — never WHAT the code does.

## Rules
- Output ONLY the commit message — no explanation, no markdown, no quotes, no preamble
- Single line, max 72 characters
- No trailing punctuation
- Active voice, present tense
- Format: type(scope): summary  or  type: summary
- Valid types: feat, fix, refactor, docs, chore, test, perf
- Infer scope from the diff (omit if unclear)

## Anti-patterns — never produce these
- refactor: update prompt formatting              ← describes code, not outcome
- feat: add validation                            ← too vague
- refactor: improve commit message quality        ← vague, could mean anything
- chore: misc improvements                        ← meaningless

## Good patterns — aim for this specificity
- refactor: prevent AI from echoing code changes instead of developer intent
- feat(auth): allow users to stay logged in across browser sessions
- fix(upload): prevent silent failures when file exceeds size limit
- perf(api): eliminate redundant DB calls on every request
    `.trim(),
  },
  {
    role: 'user',
    content: `
## Diff
${context.diff.slice(0, 6000)}

## Branch context
- Branch: ${context.branchName}
${context.expectedType ? `- Inferred type: ${context.expectedType}` : ''}
${
  context.inferredScope
    ? `- Scope: ${context.inferredScope} — YOU MUST use this as the commit scope, e.g. feat(${context.inferredScope}): ...`
    : '- Scope: infer from diff or omit'
}
${context.branchIntent ? `- Branch intent: ${context.branchIntent}` : ''}
${context.userHint ? `\n## My stated reason (use this as ground truth for the "why")\n${context.userHint}` : ''}

${
  previousMessages.length > 0
    ? `\n## PREVIOUS ATTEMPTS (DO NOT REPEAT THESE)\n${previousMessages.map((m) => `- ${m}`).join('\n')}`
    : ''
}

${
  feedback
    ? `\n## USER FEEDBACK FOR REGENERATION\nBased on the previous attempts, the user gave this instruction: "${feedback}". Follow this strictly.`
    : ''
}

Write the commit message now.
    `.trim(),
  },
];
