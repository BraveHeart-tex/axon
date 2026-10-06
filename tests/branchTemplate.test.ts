import { describe, expect, it } from 'vitest';

import {
  inferCommitTypeFromBranch,
  inferIntentFromBranch,
} from '@/domains/ai/commit/inferFromBranch.js';
import { BRANCH_TYPES } from '@/domains/branch/branch.constants.js';
import { buildBranchName, parseBranchName } from '@/domains/branch/branchTemplate.js';

import { projectContext } from './helpers/projectContext.js';

const template = '{type}/{key}-{slug}';

describe('branch templates', () => {
  it.each(BRANCH_TYPES)('round-trips %s with and without a slug', (type) => {
    expect(buildBranchName(template, { type, key: 'ORD-123', slug: 'retry-payment' })).toBe(
      `${type}/ORD-123-retry-payment`,
    );
    expect(parseBranchName(template, `${type}/ORD-123-retry-payment`)).toEqual({
      type,
      key: 'ORD-123',
      slug: 'retry-payment',
    });
    expect(buildBranchName(template, { type, key: 'ORD-123', slug: '' })).toBe(`${type}/ORD-123`);
    expect(parseBranchName(template, `${type}/ORD-123`)).toEqual({ type, key: 'ORD-123' });
  });

  it.each(['-', '/', '_', '.'])('drops the %s separator for an empty slug', (separator) => {
    const custom = `{key}${separator}{slug}`;
    const name = buildBranchName(custom, { key: 'APP_2-123', slug: '' });
    expect(name).toBe('APP_2-123');
    expect(parseBranchName(custom, name, ['APP_2'])).toEqual({ key: 'APP_2-123' });
  });

  it('escapes literal regex characters and supports reordered tokens', () => {
    const custom = 'work+/{slug}.{key}/{type}';
    const name = buildBranchName(custom, { key: 'APP-7', type: 'security', slug: 'sanitize' });
    expect(parseBranchName(custom, name, ['APP'])).toEqual({
      key: 'APP-7',
      type: 'security',
      slug: 'sanitize',
    });
    expect(parseBranchName(custom, name.replace('work+', 'workkk'), ['APP'])).toBeNull();
  });

  it('rejects unknown keys, types and invalid slugs', () => {
    for (const name of [
      'feat/ABC-1-retry',
      'spike/ORD-1-retry',
      'feat/ORD-1-Retry',
      'feat/ORD-1-retry_copy',
      'feat/ORD-1-',
    ]) {
      expect(parseBranchName(template, name)).toBeNull();
    }
  });

  it('parses a template without a type and leaves commit type to AI', () => {
    const context = projectContext({
      version: 1,
      flow: 'classified',
      branchTemplate: '{key}/{slug}',
      jira: { projectKeys: ['APP'] },
    });
    const name = buildBranchName(context.branchTemplate, {
      type: 'fix',
      key: 'APP-7',
      slug: 'retry-copy',
    });
    expect(name).toBe('APP-7/retry-copy');
    expect(parseBranchName(context.branchTemplate, name, context.jira.projectKeys)).toEqual({
      key: 'APP-7',
      slug: 'retry-copy',
    });
    expect(inferCommitTypeFromBranch(name, context)).toBeUndefined();
    expect(inferIntentFromBranch(name, context)).toBe('retry copy');
    expect(inferCommitTypeFromBranch('fix/APP-7-retry-copy', context)).toBeUndefined();
  });

  it('maps a custom template branch type to a commit type', () => {
    const context = projectContext({
      version: 1,
      flow: 'gitflow',
      branchTemplate: '{key}/{type}/{slug}',
      jira: { projectKeys: ['APP'] },
    });
    expect(inferCommitTypeFromBranch('APP-7/hotfix/retry', context)).toBe('fix');
  });
});
