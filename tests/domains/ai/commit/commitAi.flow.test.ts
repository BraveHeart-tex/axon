import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { generateMessage, runCommitAiFlow } from '@/domains/ai/commit/commitAi.service.js';

vi.mock('@/domains/ai/commit/flows/ensureAiApiKey.flow.js', () => ({
  ensureAiApiKey: vi.fn(),
}));

vi.mock('@/domains/ai/commit/flows/resolveCommitContext.flow.js', () => ({
  resolveCommitContext: vi.fn(),
}));

vi.mock('@/domains/ai/commit/flows/generateCommitMessage.flow.js', () => ({
  generateCommitMessage: vi.fn(),
}));

vi.mock('@/infra/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { ensureAiApiKey } from '@/domains/ai/commit/flows/ensureAiApiKey.flow.js';
import { resolveCommitContext } from '@/domains/ai/commit/flows/resolveCommitContext.flow.js';
import { logger } from '@/infra/logger.js';

describe('runCommitAiFlow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should generate and log a commit message', async () => {
    (ensureAiApiKey as Mock).mockResolvedValue('test-key');
    (resolveCommitContext as Mock).mockResolvedValue({ diff: 'some diff' });
    (generateMessage as Mock).mockResolvedValue('feat: test commit message');

    await runCommitAiFlow();

    expect(ensureAiApiKey).toHaveBeenCalledTimes(1);
    expect(resolveCommitContext).toHaveBeenCalledTimes(1);
    expect(generateMessage).toHaveBeenCalledWith('test-key', { diff: 'some diff' });

    expect(logger.info).toHaveBeenCalledWith('\n✨ Suggested commit message:\n', false);
    expect(logger.info).toHaveBeenCalledWith('feat: test commit message', false);
  });

  it('should fail spinner and log an error when generation fails', async () => {
    (ensureAiApiKey as Mock).mockResolvedValue('test-key');
    (resolveCommitContext as Mock).mockResolvedValue({ diff: 'some diff' });
    (generateMessage as Mock).mockRejectedValue(new Error('Generation failed'));

    await runCommitAiFlow();

    expect(logger.error).toHaveBeenCalledWith(
      'An error occurred while generating commit message: Generation failed',
    );
  });
});
