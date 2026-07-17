export interface ReleaseAbortedError extends Error {
  isReleaseAborted: true;
}

export const createReleaseAbortedError = (message: string): ReleaseAbortedError => {
  const error = new Error(message) as ReleaseAbortedError;
  error.isReleaseAborted = true;
  return error;
};

export const isReleaseAbortedError = (error: unknown): error is ReleaseAbortedError =>
  error instanceof Error && (error as Partial<ReleaseAbortedError>).isReleaseAborted === true;
