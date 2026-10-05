import { runInitFlow } from '@/domains/project/init.flow.js';
import { reportProjectContextError } from '@/domains/project/project.formatter.js';

export const initCommand = async () => {
  try {
    const writtenPath = await runInitFlow();
    if (!writtenPath) process.exitCode = 1;
  } catch (error) {
    reportProjectContextError(error);
    process.exitCode = 1;
  }
};
