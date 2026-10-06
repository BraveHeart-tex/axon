import { BRANCH_TYPES } from '@/domains/branch/branch.constants.js';
import { JIRA_PROJECT_LABELS } from '@/domains/jira/jira.constants.js';

interface BranchParts {
  type?: string;
  key?: string;
  slug?: string;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const withoutSlug = (template: string) => template.replace(/[-_/ .]?\{slug\}/g, '');

export const buildBranchName = (template: string, parts: BranchParts): string =>
  (parts.slug ? template : withoutSlug(template)).replace(
    /\{(type|key|slug)\}/g,
    (_, token: keyof BranchParts) => parts[token] ?? '',
  );

export const parseBranchName = (
  template: string,
  name: string,
  projectKeys: readonly string[] = JIRA_PROJECT_LABELS,
): BranchParts | null => {
  const patterns = {
    type: BRANCH_TYPES.join('|'),
    key: `(?:${projectKeys.map(escapeRegex).join('|')})-[0-9]+`,
    slug: '[a-z0-9-]+',
  };

  for (const variant of [template, withoutSlug(template)]) {
    const tokens: (keyof BranchParts)[] = [];
    let pattern = '';
    let offset = 0;
    for (const match of variant.matchAll(/\{(type|key|slug)\}/g)) {
      pattern += escapeRegex(variant.slice(offset, match.index));
      const token = match[1] as keyof BranchParts;
      tokens.push(token);
      pattern += `(${patterns[token]})`;
      offset = match.index + match[0].length;
    }
    pattern += escapeRegex(variant.slice(offset));
    const match = new RegExp(`^${pattern}$`).exec(name);
    if (!match) continue;
    const parts: BranchParts = {};
    for (const [index, token] of tokens.entries()) {
      const value = match[index + 1]!;
      if (parts[token] !== undefined && parts[token] !== value) return null;
      parts[token] = value;
    }
    return parts;
  }
  return null;
};
