import c from 'ansi-colors';

import { truncate } from '@/misc/truncate.js';

import type { RecentCommit } from './git.types.js';

const TYPE_COLORS: Record<string, c.StyleFunction> = {
  feat: c.green,
  fix: c.red,
  refactor: c.blue,
  chore: c.gray,
  docs: c.cyan,
  test: c.yellow,
  perf: c.magenta,
};

const SHORT_TYPES: Record<string, string> = {
  feat: 'FEAT',
  fix: 'FIX ',
  refactor: 'RFCT',
  chore: 'CHRE',
  docs: 'DOCS',
  test: 'TEST',
  perf: 'PERF',
};

const getTypeBadge = (message: string): string => {
  const match = message.match(/^(\w+)[(:]/);
  const type = match?.[1]?.toLowerCase() ?? '';

  const text = SHORT_TYPES[type] ?? 'MISC';
  const colorFn = TYPE_COLORS[type] ?? c.white;

  return colorFn(text);
};

const getScope = (message: string): string => {
  const match = message.match(/^\w+\(([\w-]+)\)/);
  return match?.[1] ?? '';
};

const getCleanMessage = (message: string): string => message.replace(/^\w+(\([\w-]+\))?!?:\s*/, '');

export const formatCommitChoice = (commit: RecentCommit) => {
  const badge = getTypeBadge(commit.message);

  const rawScope = getScope(commit.message);
  const scopeTag = rawScope
    ? c.cyan(rawScope.toUpperCase().padEnd(14)) // Switched bold off for cleaner look
    : c.dim('(no scope)    ');

  const rawMsg = getCleanMessage(commit.message);
  const paddedMsg = truncate(rawMsg, 52).padEnd(52, ' ');
  const msg = paddedMsg;

  const hash = c.dim.yellow(commit.hash.slice(0, 7));

  const rawAuthor = commit.author ?? 'unknown';
  const paddedAuthor = truncate(rawAuthor, 14).padEnd(14, ' ');
  const author = c.dim(paddedAuthor);

  const date = c.dim(commit.date ?? '');

  const name = `${badge}  ${scopeTag}  ${msg}  ${hash}  ${c.dim('│')}  ${author}  ${c.dim('·')}  ${date}`;

  return {
    name,
    value: commit.hash,
    short: `${c.cyan(rawScope || commit.hash.slice(0, 7))} ${rawMsg.slice(0, 50)}`,
  };
};

export const parseGitLog = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...msgParts] = line.trim().split(' ');
      return {
        hash,
        message: msgParts.join(' '),
      };
    });

export const formatCommits = (commitLines: string[]) =>
  commitLines.map((line) => {
    const [hash, author, date, ...messageParts] = line.split('|');

    return {
      hash,
      author,
      date,
      message: messageParts.join('|'),
    };
  });
