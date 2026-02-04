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

Format:
type(scope): summary
or
type: summary

Commit type: ${classification.type}
${classification.scope ? `Scope: ${classification.scope}` : 'Scope: omit'}
Intent:
${classification.intent}

Output ONLY the commit message.
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
