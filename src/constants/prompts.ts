export const getCommitMessagePrompt = ({
  diff,
  inferredScope,
  inferredScopeType,
}: {
  diff: string;
  inferredScope?: string;
  inferredScopeType?: string;
}) =>
  `
You are an experienced software engineer writing a **single-line** Conventional Commit message.

Format strictly as:
type(scope): summary
or
type: summary  ← (only if no scope applies)

### Requirements
- **Allowed types:** feat, fix, refactor, docs, chore
- **Scope:** use "${inferredScope ?? 'infer from context'}"
  - If no clear scope exists, omit parentheses entirely.
- **Scope Type:** use "${inferredScopeType ?? 'infer from context'}"
  - If no clear scope type exists, omit parentheses entirely.
- **Summary:** express the *reason and impact* of the change, not just the action.
- Focus on *clarity, intent, and improvement*.
- Write in an active, professional tone (e.g., “clarify”, “enhance”, “streamline”, “ensure”).
- Keep ≤ 72 characters.
- Do not include explanations, examples, or markdown.

### Reasoning Hints
- What’s the **main purpose** behind this change?
- How does it improve code quality, clarity, or behavior?
- Replace mechanical verbs like “update” or “change” with meaningful ones like:
  - "clarify", "optimize", "simplify", "enforce", "document", "align", "improve"
- If the change is internal, emphasize the *benefit* (e.g., maintainability, readability).

${inferredScope ? `Given scope: ${inferredScope}\n` : ''}

### Diff
---START---
${diff.trim().slice(0, 5000)}
---END---
`.trim();

export const getReviewPrompt = (diff: string) => `
  You are a senior developer reviewing code.
Please provide a self-review for the following staged changes:

${diff}

Highlight:
- Possible bugs
- Code smells
- Naming issues
- Missing tests
- Suggestions for improvements
  `;
