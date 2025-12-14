import chalk from 'chalk';

import { getScopeFromCommitMessage } from './git.service.js';
import { RecentCommit } from './git.types.js';

export const formatCommitChoice = (commit: RecentCommit) => {
  const hash = chalk.yellow(commit.hash);
  const scope = chalk.green(`[${getScopeFromCommitMessage(commit.message)}]`);
  const message = commit.message.length > 100 ? `${commit.message.slice(0, 100)}…` : commit.message;

  const meta = chalk.gray(`${commit.author} • ${commit.date}`);

  return {
    value: commit.hash,
    short: commit.hash,
    name: `${hash}  ${scope} ${message}\n     ${meta}`,
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
