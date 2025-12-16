import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { runReviewAiFlow } from '@/domains/ai/review/reviewAi.service.js';

vi.mock('node:fs', () => ({
  default: {
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
    })),
  },
}));

vi.mock('node:path', () => ({
  default: {
    resolve: vi.fn(() => '/tmp/ai-review.md'),
    basename: vi.fn(() => 'ai-review.md'),
  },
}));

vi.mock('@/config/apiKeyConfig.js', () => ({
  getApiKey: vi.fn(),
}));

vi.mock('@/domains/ai/ai.prompts.js', () => ({
  getReviewPrompt: vi.fn((diff: string) => `prompt for: ${diff}`),
}));

vi.mock('@/domains/ai/ai.service.js', () => ({
  streamAiResponse: vi.fn(),
}));

vi.mock('@/domains/config/config.constants.js', () => ({
  CREDENTIAL_KEYS: { AI: 'AI' },
}));

vi.mock('@/domains/git/git.service.js', () => ({
  getStagedChangesDiff: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import fs from 'node:fs';

import { getApiKey } from '@/config/apiKeyConfig.js';
import { getReviewPrompt } from '@/domains/ai/ai.prompts.js';
import { streamAiResponse } from '@/domains/ai/ai.service.js';
import { CREDENTIAL_KEYS } from '@/domains/config/config.constants.js';
import { getStagedChangesDiff } from '@/domains/git/git.service.js';
import { logger } from '@/infra/logger.js';

describe('runReviewAiFlow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should generate a review file using provided diff input', async () => {
    (getApiKey as Mock).mockResolvedValue('test-key');
    const writeStream = { write: vi.fn(), end: vi.fn() };
    (fs.createWriteStream as unknown as Mock).mockReturnValue(writeStream);
    (streamAiResponse as Mock).mockResolvedValue(undefined);

    await runReviewAiFlow('some-diff');

    expect(getApiKey).toHaveBeenCalledWith(CREDENTIAL_KEYS.AI);
    expect(getReviewPrompt).toHaveBeenCalledWith('some-diff');
    expect(streamAiResponse).toHaveBeenCalledWith({
      apiKey: 'test-key',
      prompt: 'prompt for: some-diff',
      onChunk: expect.any(Function),
    });

    const onChunk = (streamAiResponse as Mock).mock.calls[0][0].onChunk;
    onChunk('chunk-1');
    expect(writeStream.write).toHaveBeenCalledWith('chunk-1');

    expect(writeStream.end).toHaveBeenCalledTimes(1);
  });

  it('should use staged diff when diff input is null', async () => {
    (getApiKey as Mock).mockResolvedValue('test-key');
    (getStagedChangesDiff as Mock).mockResolvedValue('staged-diff');
    (streamAiResponse as Mock).mockResolvedValue(undefined);

    await runReviewAiFlow(null);

    expect(getStagedChangesDiff).toHaveBeenCalledTimes(1);
    expect(getReviewPrompt).toHaveBeenCalledWith('staged-diff');
  });

  it('should log error and return when api key is missing', async () => {
    (getApiKey as Mock).mockResolvedValue('');

    await runReviewAiFlow('some-diff');

    expect(logger.error).toHaveBeenCalledWith(
      'Groq API key is required to generate a code review.',
    );
    expect(streamAiResponse).not.toHaveBeenCalled();
  });

  it('should log error and return when no diff is available', async () => {
    (getApiKey as Mock).mockResolvedValue('test-key');
    (getStagedChangesDiff as Mock).mockResolvedValue('');

    await runReviewAiFlow(null);

    expect(logger.error).toHaveBeenCalledWith('No diff found (inline, file, or staged changes).');
    expect(streamAiResponse).not.toHaveBeenCalled();
  });

  it('should fail spinner and log error when streaming fails', async () => {
    (getApiKey as Mock).mockResolvedValue('test-key');
    (getStagedChangesDiff as Mock).mockResolvedValue('staged-diff');
    (streamAiResponse as Mock).mockRejectedValue(new Error('stream failed'));

    await runReviewAiFlow(null);
    expect(logger.error).toHaveBeenCalledWith('Error: stream failed');
  });
});
