import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { formatCommitChoice, formatCommits, parseGitLog } from '@/domains/git/git.formatter.js';

vi.mock('chalk', () => ({
  default: {
    yellow: vi.fn((text: string) => text),
    green: vi.fn((text: string) => text),
    gray: vi.fn((text: string) => text),
  },
}));

vi.mock('@/domains/git/git.service.js', () => ({
  getScopeFromCommitMessage: vi.fn(),
}));

import { getScopeFromCommitMessage } from '@/domains/git/git.service.js';

describe('git.formatter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('formatCommitChoice', () => {
    it('should format a commit choice with all fields', () => {
      (getScopeFromCommitMessage as Mock).mockReturnValue('FE-123');

      const commit = {
        hash: 'abc123',
        author: 'John Doe',
        date: '2 hours ago',
        message: 'feat: add new feature',
      };

      const result = formatCommitChoice(commit);

      expect(getScopeFromCommitMessage).toHaveBeenCalledWith('feat: add new feature');
      expect(result).toEqual({
        value: 'abc123',
        short: 'abc123',
        name: 'abc123  [FE-123] feat: add new feature\n     John Doe • 2 hours ago',
      });
    });

    it('should truncate long messages to 100 characters', () => {
      (getScopeFromCommitMessage as Mock).mockReturnValue('ORD-456');

      const longMessage = 'a'.repeat(150);
      const commit = {
        hash: 'def456',
        author: 'Jane Smith',
        date: '1 day ago',
        message: longMessage,
      };

      const result = formatCommitChoice(commit);

      expect(result.name).toContain('a'.repeat(100) + '…');
      expect(result.name).not.toContain('a'.repeat(101));
    });

    it('should handle messages exactly 100 characters without truncation', () => {
      (getScopeFromCommitMessage as Mock).mockReturnValue('FE-789');

      const exactMessage = 'a'.repeat(100);
      const commit = {
        hash: 'ghi789',
        author: 'Bob',
        date: '3 days ago',
        message: exactMessage,
      };

      const result = formatCommitChoice(commit);

      expect(result.name).toContain(exactMessage);
      expect(result.name).not.toContain('…');
    });

    it('should handle empty scope', () => {
      (getScopeFromCommitMessage as Mock).mockReturnValue('');

      const commit = {
        hash: 'xyz999',
        author: 'Alice',
        date: '1 week ago',
        message: 'fix: bug fix',
      };

      const result = formatCommitChoice(commit);

      expect(result.name).toContain('[]');
    });

    it('should handle empty message', () => {
      (getScopeFromCommitMessage as Mock).mockReturnValue('DIS-100');

      const commit = {
        hash: 'empty001',
        author: 'Test User',
        date: 'now',
        message: '',
      };

      const result = formatCommitChoice(commit);

      expect(result.name).toContain('[DIS-100]');
      expect(result.value).toBe('empty001');
    });
  });

  describe('parseGitLog', () => {
    it('should parse single line git log output', () => {
      const stdout = 'abc123 feat: add feature';

      const result = parseGitLog(stdout);

      expect(result).toEqual([
        {
          hash: 'abc123',
          message: 'feat: add feature',
        },
      ]);
    });

    it('should parse multiple lines of git log output', () => {
      const stdout = `abc123 feat: add feature
def456 fix: bug fix
ghi789 chore: update deps`;

      const result = parseGitLog(stdout);

      expect(result).toEqual([
        { hash: 'abc123', message: 'feat: add feature' },
        { hash: 'def456', message: 'fix: bug fix' },
        { hash: 'ghi789', message: 'chore: update deps' },
      ]);
    });

    it('should filter out empty lines', () => {
      const stdout = `abc123 feat: add feature

def456 fix: bug fix

ghi789 chore: update deps`;

      const result = parseGitLog(stdout);

      expect(result).toHaveLength(3);
      expect(result[0]?.hash).toBe('abc123');
      expect(result[1]?.hash).toBe('def456');
      expect(result[2]?.hash).toBe('ghi789');
    });

    it('should handle messages with multiple spaces', () => {
      const stdout = 'abc123 feat:  add   feature   with   spaces';

      const result = parseGitLog(stdout);

      expect(result).toEqual([
        {
          hash: 'abc123',
          message: 'feat:  add   feature   with   spaces',
        },
      ]);
    });

    it('should handle commit hash only (no message)', () => {
      const stdout = 'abc123';

      const result = parseGitLog(stdout);

      expect(result).toEqual([
        {
          hash: 'abc123',
          message: '',
        },
      ]);
    });

    it('should trim whitespace from lines but preserve message spacing', () => {
      const stdout = '  abc123   feat: add feature  ';

      const result = parseGitLog(stdout);

      expect(result).toEqual([
        {
          hash: 'abc123',
          message: '  feat: add feature',
        },
      ]);
    });

    it('should handle empty input', () => {
      const result = parseGitLog('');

      expect(result).toEqual([]);
    });
  });

  describe('formatCommits', () => {
    it('should parse pipe-delimited commit lines', () => {
      const commitLines = ['abc123|John Doe|2 hours ago|feat: add feature'];

      const result = formatCommits(commitLines);

      expect(result).toEqual([
        {
          hash: 'abc123',
          author: 'John Doe',
          date: '2 hours ago',
          message: 'feat: add feature',
        },
      ]);
    });

    it('should parse multiple commit lines', () => {
      const commitLines = [
        'abc123|John Doe|2 hours ago|feat: add feature',
        'def456|Jane Smith|1 day ago|fix: bug fix',
        'ghi789|Bob|3 days ago|chore: update deps',
      ];

      const result = formatCommits(commitLines);

      expect(result).toEqual([
        {
          hash: 'abc123',
          author: 'John Doe',
          date: '2 hours ago',
          message: 'feat: add feature',
        },
        {
          hash: 'def456',
          author: 'Jane Smith',
          date: '1 day ago',
          message: 'fix: bug fix',
        },
        {
          hash: 'ghi789',
          author: 'Bob',
          date: '3 days ago',
          message: 'chore: update deps',
        },
      ]);
    });

    it('should handle messages containing pipe characters', () => {
      const commitLines = ['abc123|John Doe|2 hours ago|feat: add | pipe | in message'];

      const result = formatCommits(commitLines);

      expect(result).toEqual([
        {
          hash: 'abc123',
          author: 'John Doe',
          date: '2 hours ago',
          message: 'feat: add | pipe | in message',
        },
      ]);
    });

    it('should handle empty message', () => {
      const commitLines = ['abc123|John Doe|2 hours ago|'];

      const result = formatCommits(commitLines);

      expect(result).toEqual([
        {
          hash: 'abc123',
          author: 'John Doe',
          date: '2 hours ago',
          message: '',
        },
      ]);
    });

    it('should handle empty commit lines array', () => {
      const result = formatCommits([]);

      expect(result).toEqual([]);
    });

    it('should handle malformed lines (missing fields)', () => {
      const commitLines = ['abc123|John Doe'];

      const result = formatCommits(commitLines);

      expect(result).toEqual([
        {
          hash: 'abc123',
          author: 'John Doe',
          date: undefined,
          message: '',
        },
      ]);
    });

    it('should handle lines with only hash', () => {
      const commitLines = ['abc123'];

      const result = formatCommits(commitLines);

      expect(result).toEqual([
        {
          hash: 'abc123',
          author: undefined,
          date: undefined,
          message: '',
        },
      ]);
    });
  });
});
