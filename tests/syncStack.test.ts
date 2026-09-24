import { describe, expect, it } from 'vitest';

import { buildSyncGraph, findStackRoot, isStacked } from '@/domains/branch/syncStack.js';

const mr = (iid: string, sourceBranch: string, targetBranch = 'develop') => ({
  iid,
  sourceBranch,
  targetBranch,
});

describe('buildSyncGraph', () => {
  it('links a child to the listed MR whose source is its target', () => {
    const graph = buildSyncGraph([
      mr('1', 'feat/a'),
      mr('2', 'feat/b', 'feat/a'),
      mr('3', 'feat/c'),
    ]);

    expect(graph.parentOf).toEqual(new Map([['2', '1']]));
    expect(graph.inCycle.size).toBe(0);
    expect(isStacked(graph, '1')).toBe(true);
    expect(isStacked(graph, '2')).toBe(true);
    expect(isStacked(graph, '3')).toBe(false);
  });

  it('treats a target that no listed MR owns as a normal target', () => {
    expect(buildSyncGraph([mr('2', 'feat/b', 'feat/a')]).parentOf.size).toBe(0);
  });

  it('finds the root of a multi-level stack', () => {
    const graph = buildSyncGraph([
      mr('3', 'feat/c', 'feat/b'),
      mr('2', 'feat/b', 'feat/a'),
      mr('1', 'feat/a'),
    ]);

    expect(findStackRoot(graph, '3')).toBe('1');
  });

  it('marks only the MRs on a cycle', () => {
    const graph = buildSyncGraph([
      mr('1', 'feat/a', 'feat/b'),
      mr('2', 'feat/b', 'feat/a'),
      mr('3', 'feat/c', 'feat/a'),
    ]);

    expect(graph.inCycle).toEqual(new Set(['1', '2']));
  });
});
