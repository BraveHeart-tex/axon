import readline from 'node:readline';

import c from 'ansi-colors';

import { formatCommitChoice } from '@/domains/git/git.formatter.js';
import type { RecentCommit } from '@/domains/git/git.types.js';

type KeypressKey = {
  ctrl?: boolean;
  name?: string;
  sequence?: string;
};

type SearchableCommitCheckboxOptions = {
  commits: RecentCommit[];
  message: string;
  pageSize?: number;
  requiredMessage?: string;
};

const getCommitSearchText = (commit: RecentCommit): string =>
  [commit.hash, commit.message, commit.author, commit.date].filter(Boolean).join(' ').toLowerCase();

const filterCommitsBySearch = (commits: RecentCommit[], searchTerm: string): RecentCommit[] => {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  if (normalizedSearchTerm === '') {
    return commits;
  }

  return commits.filter((commit) => getCommitSearchText(commit).includes(normalizedSearchTerm));
};

const isPrintableKey = (key: KeypressKey): boolean =>
  key.sequence !== undefined && key.sequence.length === 1 && key.ctrl !== true;

const countRenderedRows = (lines: string[], width: number): number =>
  lines.reduce(
    (rowCount, line) => rowCount + Math.max(1, Math.ceil(c.unstyle(line).length / width)),
    0,
  );

export const promptSearchableCommitCheckbox = async ({
  commits,
  message,
  pageSize = 15,
  requiredMessage = 'Select at least one commit.',
}: SearchableCommitCheckboxOptions): Promise<string[]> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Commit selection requires an interactive terminal.');
  }

  const stdin = process.stdin;
  const stdout = process.stdout;
  const selectedHashes = new Set<string>();
  const wasRaw = stdin.isRaw;
  let activeIndex = 0;
  let errorMessage = '';
  let renderedRowCount = 0;
  let searchTerm = '';

  const getVisibleCommits = () => filterCommitsBySearch(commits, searchTerm);

  const cleanup = (onKeypress: (str: string, key: KeypressKey) => void) => {
    stdin.off('keypress', onKeypress);
    stdin.setRawMode(wasRaw);
    stdout.write('\n');
  };

  const render = () => {
    const visibleCommits = getVisibleCommits();
    const pageStart = Math.max(
      0,
      Math.min(activeIndex - pageSize + 1, Math.max(visibleCommits.length - pageSize, 0)),
    );
    const pageCommits = visibleCommits.slice(pageStart, pageStart + pageSize);
    const lines = [
      `${c.cyan('?')} ${message} ${c.dim(`(${visibleCommits.length}/${commits.length} shown, ${selectedHashes.size} selected)`)}`,
      `${c.dim('Search:')} ${searchTerm === '' ? c.dim('type to filter') : c.cyan(searchTerm)}`,
    ];

    if (visibleCommits.length === 0) {
      lines.push(c.dim('  No commits match that search.'));
    } else {
      for (const [offset, commit] of pageCommits.entries()) {
        const listIndex = pageStart + offset;
        const cursor = listIndex === activeIndex ? c.cyan('❯') : ' ';
        const checked = selectedHashes.has(commit.hash) ? c.green('◉') : c.dim('◯');
        const name = formatCommitChoice(commit).name;
        const line = `${cursor}${checked} ${name}`;
        lines.push(listIndex === activeIndex ? c.cyan(line) : line);
      }
    }

    if (errorMessage !== '') {
      lines.push(c.red(errorMessage));
    }

    lines.push(
      c.dim('↑↓ navigate • space select • type search • backspace edit • esc clear • enter submit'),
    );

    const rowCount = countRenderedRows(lines, stdout.columns ?? 80);

    if (renderedRowCount > 0) {
      readline.cursorTo(stdout, 0);
      readline.moveCursor(stdout, 0, -(renderedRowCount - 1));
      readline.clearScreenDown(stdout);
    }

    stdout.write(lines.join('\n'));
    renderedRowCount = rowCount;
  };

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  return await new Promise<string[]>((resolve, reject) => {
    const finish = (result: string[]) => {
      cleanup(onKeypress);
      resolve(result);
    };

    const fail = (error: Error) => {
      cleanup(onKeypress);
      reject(error);
    };

    const onKeypress = (_str: string, key: KeypressKey) => {
      const visibleCommits = getVisibleCommits();
      errorMessage = '';

      if (key.ctrl === true && key.name === 'c') {
        fail(new Error('Prompt canceled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        if (selectedHashes.size === 0) {
          errorMessage = requiredMessage;
          render();
          return;
        }

        finish(
          commits.filter((commit) => selectedHashes.has(commit.hash)).map((commit) => commit.hash),
        );
        return;
      }

      if (key.name === 'up') {
        activeIndex = Math.max(activeIndex - 1, 0);
        render();
        return;
      }

      if (key.name === 'down') {
        activeIndex = Math.min(activeIndex + 1, Math.max(visibleCommits.length - 1, 0));
        render();
        return;
      }

      if (key.name === 'space') {
        const activeCommit = visibleCommits[activeIndex];

        if (activeCommit !== undefined) {
          if (selectedHashes.has(activeCommit.hash)) {
            selectedHashes.delete(activeCommit.hash);
          } else {
            selectedHashes.add(activeCommit.hash);
          }
        }

        render();
        return;
      }

      if (key.name === 'backspace') {
        searchTerm = searchTerm.slice(0, -1);
        activeIndex = 0;
        render();
        return;
      }

      if (key.name === 'escape') {
        searchTerm = '';
        activeIndex = 0;
        render();
        return;
      }

      if (isPrintableKey(key)) {
        searchTerm += key.sequence;
        activeIndex = 0;
        render();
      }
    };

    stdin.on('keypress', onKeypress);
    render();
  });
};
