import { CommitContext } from './flows/resolveCommitContext.flow.js';

const CONVENTIONAL_PREFIX = /^(feat|fix|refactor|docs|chore|test|perf)(?:\(([^)]+)\))?:\s*(.+)$/i;
const DEFAULT_COMMIT_TYPE = 'chore';
const MAX_COMMIT_LENGTH = 72;

interface ParsedCommit {
  type: string;
  scope?: string;
  summary: string;
}

const getFirstLine = (value: string): string => value.split('\n')[0]?.trim() ?? '';

const sanitizeSummary = (value: string): string =>
  value
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;,:\s]+$/g, '')
    .trim();

const parseCommitMessage = (value: string): ParsedCommit | null => {
  const match = value.match(CONVENTIONAL_PREFIX);
  if (!match) return null;

  return {
    type: match[1].toLowerCase(),
    scope: match[2]?.trim(),
    summary: sanitizeSummary(match[3] ?? ''),
  };
};

const buildPrefix = (type: string, scope?: string): string =>
  scope ? `${type}(${scope}): ` : `${type}: `;

const truncateSummary = (summary: string, prefix: string): string => {
  const maxSummaryLength = Math.max(1, MAX_COMMIT_LENGTH - prefix.length);
  if (summary.length <= maxSummaryLength) {
    return summary;
  }

  const truncated = summary.slice(0, maxSummaryLength).trim();
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace <= 0) {
    return truncated;
  }

  return truncated.slice(0, lastSpace).trim();
};

const formatCommit = ({ type, scope, summary }: ParsedCommit): string => {
  const prefix = buildPrefix(type, scope);
  return `${prefix}${truncateSummary(summary, prefix)}`.trim();
};

export const normalizeGeneratedCommitMessage = (
  raw: string,
  context: Pick<CommitContext, 'expectedType' | 'inferredScope'>,
): string => {
  const base = sanitizeSummary(getFirstLine(raw));
  if (!base) {
    throw new Error('AI returned an empty commit message.');
  }

  const parsed = parseCommitMessage(base);
  if (parsed) {
    return formatCommit({
      ...parsed,
      scope: parsed.scope ?? context.inferredScope,
    });
  }

  return formatCommit({
    type: context.expectedType ?? DEFAULT_COMMIT_TYPE,
    scope: context.inferredScope,
    summary: base,
  });
};
