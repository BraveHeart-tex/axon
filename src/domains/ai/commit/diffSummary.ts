export interface DiffSummary {
  files: {
    path: string;
    kind: 'test' | 'config' | 'source' | 'asset' | 'other';
    changeType: 'add' | 'modify' | 'delete';
  }[];
  stats: {
    filesChanged: number;
  };
}

export const summarizeDiff = (diff: string): DiffSummary => {
  const files = new Map<string, DiffSummary['files'][0]>();

  for (const line of diff.split('\n')) {
    if (!line.startsWith('diff --git')) continue;

    const match = line.match(/a\/(.+?) b\/(.+)/);
    if (!match) continue;

    const path = match[2];

    if (!files.has(path)) {
      files.set(path, {
        path,
        kind: inferFileKind(path),
        changeType: 'modify',
      });
    }
  }

  return {
    files: [...files.values()],
    stats: {
      filesChanged: files.size,
    },
  };
};

const inferFileKind = (path: string): DiffSummary['files'][0]['kind'] => {
  if (/test|spec/i.test(path)) return 'test';
  if (/config|env|json|ya?ml/i.test(path)) return 'config';
  if (/\.(png|jpg|svg|gif)$/i.test(path)) return 'asset';
  if (/\.(ts|tsx|js|jsx)$/i.test(path)) return 'source';
  return 'other';
};
