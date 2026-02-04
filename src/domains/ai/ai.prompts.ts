import { CommitClassification } from './commit/flows/classifyCommit.flow.js';
import { CommitContext } from './commit/flows/resolveCommitContext.flow.js';
import { formatSummary } from './commit/formatSummary.js';

export const getCommitMessagePrompt = (classification: CommitClassification) =>
  `
Generate ONE Conventional Commit message.

Hard rules:
- Single line only
- No punctuation at end
- Max 100 characters
- Active voice
- No markdown or explanations
- MUST explain the reason or impact, not the implementation details

Forbidden:
- Describing code changes (e.g. "add", "update", "change", "refactor")
- Listing files, functions, or technical steps

Required:
- Explain WHY the change exists or WHAT problem it solves
- Focus on user, system, or developer impact

Format:
type(scope): summary
or
type: summary

Commit type: ${classification.type}
${classification.scope ? `Scope: ${classification.scope}` : 'Scope: omit'}

Reason / intent (do not restate verbatim):
${classification.intent}

Examples (style reference only):
- fix(auth): prevent silent login failures
- feat(upload): enable secure client-side image handling
- refactor(api): simplify request validation flow

Output ONLY the commit message.
`.trim();

export const getReviewPrompt = (diff: string) => `
  You are a principal-level Software Engineer with 10+ years of experience building high-performance, scalable, and maintainable applications.
  * Assume this code is part of a production-grade system.
  * Prefer actionable, concrete suggestions over generic advice
  * Call out both improvements and risks

  Output Format:
  Organize findings into severity-based sections:
  - Critical (Must fix)
  Issues that can cause bugs, broken behavior, data inconsistency, or rule violations.
  - High (Should fix)
  Issues that may cause performance degradation, maintainability problems, or incorrect assumptions.
  - Medium (Nice to improve)
  Improvements that increase clarity, structure, or long-term scalability.
  - Low (Nitpicks / Style)
  Minor suggestions related to naming, formatting, or conventions.
  For each item, include:
  * What changed (reference the diff)
  * Why it matters
  * Concrete recommendation (prefer examples or alternative patterns)
  If something is done well, explicitly call it out under:
  Positive Observations

  Below is the git diff to review:
  \`\`\`diff
${diff}
  \`\`\`
`;

export const getClassificationPrompt = (context: CommitContext) =>
  `
Classify the staged changes.

Return JSON only:
{
  "type": "feat|fix|refactor|docs|chore",
  "scope": "string | null",
  "intent": "short intent, max 12 words"
}

Hints:
- Expected type: ${context.expectedType ?? 'infer'}
- Scope from branch: ${context.inferredScope ?? 'infer'}
- Branch intent: ${context.branchIntent ?? 'none'}

High-level summary:
${formatSummary(context.diffSummary)}

Raw diff (reference only):
${context.diff.slice(0, 3000)}
`.trim();
