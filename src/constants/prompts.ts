export const getCommitMessagePrompt = ({
  diff,
  inferredScope,
}: {
  diff: string;
  inferredScope?: string;
}) => {
  return `
You are an expert software engineer crafting a clear, purposeful commit message.

Generate **exactly one line** in Conventional Commit format:
type(scope): concise summary

Guidelines:
- Allowed types: feat, fix, refactor, docs, chore
- Use the provided inferred scope, or infer it from file paths
- Express **why** the change was made and its **intended effect**, not just what changed
- Prefer phrasing that’s understandable to product managers or non-technical readers
- If the purpose is unclear, infer the most likely intent (e.g., reliability, performance, consistency)
- Keep it under 72 characters
- No explanations or commentary outside the commit line

${inferredScope ? `Inferred scope: ${inferredScope}` : ''}

Diff:
---START---
${diff.trim().slice(0, 5000)}
---END---
`.trim();
};

export const getReviewPrompt = (diff: string) => {
  return `
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
};
