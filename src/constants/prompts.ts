export const getCommitMessagePrompt = ({
  diff,
  inferredScope,
}: {
  diff: string;
  inferredScope?: string;
}) => {
  return `
You are an expert developer. Generate a single, high-quality commit message based on the diff.

Rules:
- Use Conventional Commits: type(scope): short summary.
- Types: feat, fix, refactor, docs, chore.
- Use the provided inferred scope, or infer from file paths.
- Focus on purpose and impact, not line-level changes.
- Ignore formatting-only or trivial changes.
- Output **exactly one line**, ≤72 characters.
- **Do NOT add explanations or commentary**.

${inferredScope ? `Inferred scope: ${inferredScope}` : ''}

Diff:
---START---
${diff.trim().slice(0, 5000)}
---END---
`.trim();
};
