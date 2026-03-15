import chalk from 'chalk';

import { truncate } from '@/misc/truncate.js';

import type { RecentCommit } from './git.types.js';

const TYPE_BADGE: Record<string, string> = {
  feat: chalk.bgGreen.black(' FEAT '),
  fix: chalk.bgRed.white(' FIX  '),
  refactor: chalk.bgBlue.white(' RFCT '),
  chore: chalk.bgGray.white(' CHRE '),
  docs: chalk.bgCyan.black(' DOCS '),
  test: chalk.bgYellow.black(' TEST '),
  perf: chalk.bgMagenta.white(' PERF '),
};

const getTypeBadge = (message: string): string => {
  const match = message.match(/^(\w+)[(:]/);
  const type = match?.[1]?.toLowerCase() ?? '';
  return TYPE_BADGE[type] ?? chalk.bgWhite.black(' MISC ');
};

const getScope = (message: string): string => {
  const match = message.match(/^\w+\(([\w-]+)\)/);
  return match?.[1] ?? '';
};

const getCleanMessage = (message: string): string => message.replace(/^\w+(\([\w-]+\))?!?:\s*/, '');

export const formatCommitChoice = (commit: RecentCommit) => {
  const badge = getTypeBadge(commit.message);
  const hash = chalk.dim.yellow(commit.hash.slice(0, 7));
  const scope = getScope(commit.message);

  // Scope is the hero — padded to fixed width so columns align
  const scopeTag = scope
    ? chalk.cyan.bold(scope.toUpperCase().padEnd(14))
    : chalk.dim('(no scope)    ');

  const msg = chalk.dim(truncate(getCleanMessage(commit.message), 52));
  const author = chalk.dim(truncate(commit.author ?? 'unknown', 16));
  const date = chalk.dim(commit.date ?? '');

  //  FIX   CLI-1234        message dimmed out...    hash  │  author · date
  const name = `${badge}  ${scopeTag}  ${msg}  ${hash}  ${chalk.dim('│')}  ${author}  ${chalk.dim('·')}  ${date}`;

  return {
    name,
    value: commit.hash,
    short: `${chalk.cyan(scope || commit.hash.slice(0, 7))} ${getCleanMessage(commit.message).slice(0, 50)}`,
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
