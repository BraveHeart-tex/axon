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
Write the strongest commit subject you can from imperfect evidence.
Prefer developer intent or user impact over mechanical code descriptions.
If the true "why" is not stated, describe the most meaningful outcome of the change.

## Rules
- Output ONLY the commit message — no explanation, no markdown, no quotes, no preamble
- Single line, max 72 characters
- No trailing punctuation
- Active voice, present tense
- Format: type(scope): summary  or  type: summary
- Valid types: feat, fix, refactor, docs, chore, test, perf
- Prefer the provided commit type/scope hints when present

## Decision order
1. Treat the user's stated reason as ground truth when provided
2. Otherwise use branch intent and inferred commit type as the main clue
3. Use the diff to refine the summary, not to mechanically narrate code edits

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
${context.expectedType ? `- Inferred type: ${context.expectedType} — prefer this unless clearly wrong` : ''}
${
  context.inferredScope
    ? `- Scope: ${context.inferredScope} — YOU MUST use this as the commit scope, e.g. feat(${context.inferredScope}): ...`
    : '- Scope: infer from diff or omit'
}
${context.branchIntent ? `- Branch intent: ${context.branchIntent}` : ''}
${context.userHint ? `\n## My stated reason\n${context.userHint}` : '\n## My stated reason\nNot provided'}

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
