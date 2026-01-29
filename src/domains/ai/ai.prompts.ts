export const getCommitMessagePrompt = ({
  diff,
  inferredScope,
  inferredScopeType,
}: {
  diff: string;
  inferredScope?: string;
  inferredScopeType?: string;
}) =>
  `Generate a single-line Conventional Commit message.

Format: type(scope): summary  OR  type: summary

Types: feat, fix, refactor, docs, chore
${inferredScope ? `Scope: ${inferredScope}` : 'Scope: infer from diff or omit if unclear'}
${inferredScopeType ? `Context: ${inferredScopeType}` : ''}

Summary guidelines:
- Express WHY and the impact, not just what changed
- Use clear verbs: clarify, enhance, optimize, enforce, streamline, ensure
- Avoid generic verbs: update, change, modify
- Max 100 chars total
- Professional, active voice

Diff:
${diff.trim().slice(0, 5000)}

Output only the commit message, nothing else.`.trim();

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
