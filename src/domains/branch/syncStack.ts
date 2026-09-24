type StackNode = { iid: string; sourceBranch: string; targetBranch: string };

export type SyncGraph = {
  parentOf: Map<string, string>;
  inCycle: Set<string>;
};

// A child's target is another listed MR's source; that MR is its parent.
export const buildSyncGraph = (mrs: StackNode[]): SyncGraph => {
  const bySource = new Map<string, string>();

  for (const mr of mrs) {
    if (!bySource.has(mr.sourceBranch)) bySource.set(mr.sourceBranch, mr.iid);
  }

  const parentOf = new Map<string, string>();

  for (const mr of mrs) {
    const parent = bySource.get(mr.targetBranch);
    if (parent && parent !== mr.iid) parentOf.set(mr.iid, parent);
  }

  const inCycle = new Set<string>();

  for (const mr of mrs) {
    const seen = new Set<string>();
    let current: string | undefined = mr.iid;

    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      current = parentOf.get(current);
    }

    if (current === mr.iid) inCycle.add(mr.iid);
  }

  return { parentOf, inCycle };
};

export const findStackRoot = ({ parentOf, inCycle }: SyncGraph, iid: string) => {
  let current = iid;

  while (!inCycle.has(current)) {
    const parent = parentOf.get(current);
    if (parent === undefined) return current;
    current = parent;
  }

  return current;
};

export const isStacked = ({ parentOf }: SyncGraph, iid: string) =>
  parentOf.has(iid) || [...parentOf.values()].includes(iid);
