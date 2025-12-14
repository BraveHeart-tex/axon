export interface ReleaseOptions {
  onlyUnmerged: boolean;
  author: string;
}

export interface ReleaseInput {
  branchTitle: string;
  commits: string[];
}
