import fs from 'fs';
import path from 'path';

const FROM_BUILDER = /^FROM\s+base\s+AS\s+builder/i;
const COPY_DOT_REGEX = /^\s*COPY\b.*\.\s+\.\s*$/i;
const ARG_LINE = /^\s*ARG\s+([A-Z0-9_]+)/i;

export function updateDockerfileFeatureFlag(flagName: string) {
  const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile.local');
  if (!fs.existsSync(dockerfilePath)) return;

  const lines = fs.readFileSync(dockerfilePath, 'utf-8').split(/\r?\n/);
  const argName = `NEXT_PUBLIC_${flagName.replace(/^NEXT_PUBLIC_/, '')}`;

  const builderStart = lines.findIndex((l) => FROM_BUILDER.test(l));
  if (builderStart === -1) return;

  // Find last COPY line in builder stage
  let lastCopyIndex = -1;
  for (let i = builderStart + 1; i < lines.length; i++) {
    if (/^FROM\b/i.test(lines[i])) break; // next stage
    if (COPY_DOT_REGEX.test(lines[i])) lastCopyIndex = i;
  }
  if (lastCopyIndex === -1) return;

  // Find existing ARGs after COPY
  const argStart = lastCopyIndex + 1;
  let argEnd = argStart;
  const existingArgs: string[] = [];
  while (argEnd < lines.length && ARG_LINE.test(lines[argEnd])) {
    existingArgs.push(lines[argEnd].trim());
    argEnd++;
  }

  // Add new ARG if missing
  if (!existingArgs.some((l) => extractKey(l) === argName)) {
    existingArgs.push(`ARG ${argName}`);
  }

  // Sort alphabetically
  existingArgs.sort((a, b) => extractKey(a).localeCompare(extractKey(b)));

  // Rebuild Dockerfile
  const finalLines = [...lines.slice(0, argStart), ...existingArgs, ...lines.slice(argEnd)];

  const content = finalLines.join('\n');
  fs.writeFileSync(dockerfilePath, content, 'utf-8');
}

function extractKey(line: string): string {
  const m = line.match(ARG_LINE);
  return m ? m[1] : '';
}
