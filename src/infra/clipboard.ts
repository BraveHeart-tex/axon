import { execa } from 'execa';

/**
 * Copies a string to the system clipboard (MacOS focus)
 */
export const copyToClipboard = async (text: string): Promise<void> => {
  try {
    // Using pbcopy for MacOS.
    // For cross-platform, consider the 'clipboardy' package.
    await execa('bash', ['-c', `echo "${text}" | pbcopy`]);
  } catch {
    throw new Error('Could not copy to clipboard.');
  }
};
