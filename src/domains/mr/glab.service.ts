import { execa } from 'execa';

export type MyMergeRequest = {
  iid: string;
  sourceBranch: string;
  targetBranch: string;
};

export const checkGlabAuth = async (): Promise<boolean> => {
  const result = await execa('glab', ['auth', 'status'], { reject: false });
  return result.exitCode === 0;
};

export const listMyOpenMergeRequests = async (): Promise<MyMergeRequest[]> => {
  const { stdout } = await execa('glab', ['mr', 'list', '--assignee=@me', '--output', 'json']);

  if (!stdout.trim()) return [];

  const raw = JSON.parse(stdout) as Array<{
    iid: number | string;
    source_branch: string;
    target_branch: string;
    draft?: boolean;
    work_in_progress?: boolean;
  }>;

  return raw
    .filter((mr) => !mr.draft && !mr.work_in_progress)
    .map((mr) => ({
      iid: String(mr.iid),
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
    }));
};
