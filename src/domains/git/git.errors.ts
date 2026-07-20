export interface BranchUpdateAbortedError extends Error {
  isBranchUpdateAborted: true;
}

export const createBranchUpdateAbortedError = (message: string): BranchUpdateAbortedError => {
  const error = new Error(message) as BranchUpdateAbortedError;
  error.isBranchUpdateAborted = true;
  return error;
};

export const isBranchUpdateAbortedError = (error: unknown): error is BranchUpdateAbortedError =>
  error instanceof Error && (error as Partial<BranchUpdateAbortedError>).isBranchUpdateAborted === true;
