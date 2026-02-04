import { DiffSummary } from './diffSummary.js';

export const formatSummary = (summary: DiffSummary): string => {
  if (!summary.files.length) return 'No files changed';

  return summary.files
    .slice(0, 10)
    .map((f) => `- ${f.changeType} ${f.kind} file: ${f.path}`)
    .join('\n');
};
