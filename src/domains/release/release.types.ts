import type { RecentCommit } from '@/domains/git/git.types.js';

export interface ReleaseOptions {
  onlyUnmerged: boolean;
  author: string;
}

export interface ReleaseInput {
  branchTitle: string;
  commits: string[]; // hashes only — for executor
  recentCommits: RecentCommit[]; // full data — for confirmation screen
}

export interface ReleasePlan {
  branchTitle: string;
  commits: string[]; // hashes to cherry-pick
  recentCommits: RecentCommit[]; // for display in confirm screen
}
