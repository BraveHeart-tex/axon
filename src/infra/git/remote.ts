interface ParsedRemote {
  host: string;
  path: string;
}

const SCP_LIKE_REMOTE = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/;

const normalizePath = (value: string) =>
  value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');

const buildRemote = (host: string, rawPath: string): ParsedRemote | null => {
  const normalizedHost = host.trim().toLowerCase();
  const path = normalizePath(rawPath);
  if (!normalizedHost || !path) return null;
  return { host: normalizedHost, path };
};

export const parseRemote = (url: string): ParsedRemote | null => {
  const value = url.trim();
  if (!value) return null;

  if (value.includes('://')) {
    try {
      const parsed = new URL(value);
      return buildRemote(parsed.hostname, decodeURIComponent(parsed.pathname));
    } catch {
      return null;
    }
  }

  const match = value.match(SCP_LIKE_REMOTE);
  if (!match) return null;
  return buildRemote(match[1], match[2]);
};
