import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInterruptHandler, registerCancellation } from '@/infra/cancellation.js';

const setup = () => {
  const exit = vi.fn();
  const stdout = vi.fn();
  const stderr = vi.fn();
  return { exit, stdout, stderr, interrupt: createInterruptHandler({ exit, stdout, stderr }) };
};

let unregister: (() => void) | undefined;

describe('createInterruptHandler', () => {
  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  it('exits 1 immediately when no cleanup is registered', async () => {
    const { exit, stdout, interrupt } = setup();

    await interrupt();

    expect(stdout).toHaveBeenCalledWith('Interrupted. Exiting…\n');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('aborts the signal, runs the cleanup, then exits 130', async () => {
    const { exit, interrupt } = setup();
    const cleanup = vi.fn(async () => expect(exit).not.toHaveBeenCalled());
    const registration = registerCancellation(cleanup);
    unregister = registration.unregister;

    await interrupt();

    expect(registration.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
  });

  it('exits 130 at once on a second Ctrl+C while the cleanup is still running', async () => {
    const { exit, interrupt } = setup();
    let finishCleanup!: () => void;
    unregister = registerCancellation(
      () => new Promise<void>((resolve) => (finishCleanup = resolve)),
    ).unregister;

    const first = interrupt();
    await interrupt();

    expect(exit).toHaveBeenCalledExactlyOnceWith(130);

    finishCleanup();
    await first;
    expect(exit).toHaveBeenCalledTimes(2);
  });

  it('still exits 130 and reports the error when the cleanup fails', async () => {
    const { exit, stderr, interrupt } = setup();
    unregister = registerCancellation(async () => {
      throw new Error('boom');
    }).unregister;

    await interrupt();

    expect(stderr).toHaveBeenCalledWith('Cleanup failed: boom\n');
    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
  });

  it('exits 1 like other commands once the flow has unregistered', async () => {
    const { exit, interrupt } = setup();
    registerCancellation(vi.fn()).unregister();

    await interrupt();

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
