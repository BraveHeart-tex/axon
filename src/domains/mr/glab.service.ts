import { execa } from 'execa';

export type MyMergeRequest = {
  iid: string;
  sourceBranch: string;
  targetBranch: string;
  sourceProjectId: number;
  targetProjectId: number;
  draft: boolean;
};

type RawMergeRequest = {
  iid: number | string;
  source_branch: string;
  target_branch: string;
  source_project_id: number;
  target_project_id: number;
  draft?: boolean;
  work_in_progress?: boolean;
};

const PER_PAGE = 100;

export const checkGlabAuth = async (): Promise<boolean> => {
  const result = await execa('glab', ['auth', 'status'], { reject: false });
  return result.exitCode === 0;
};

const MAX_PAGES = 50;

const glabFailure = (command: string, error: unknown) => {
  const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();

  return new Error(
    `\`${command}\` failed. Run this in a repo with a GitLab origin remote and make sure \`glab auth login\` has been run.${
      stderr ? `\n${stderr}` : ''
    }`,
  );
};

const parseGlabJson = <T>(command: string, stdout: string): T => {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    const [firstLine = ''] = stdout.trim().split('\n');
    throw new Error(
      `\`${command}\` returned output that is not JSON. Update glab and rerun.\n${firstLine}`,
    );
  }
};

const listOpenMergeRequests = async (filter: string): Promise<RawMergeRequest[]> => {
  const mergeRequests: RawMergeRequest[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    let stdout: string;

    try {
      ({ stdout } = await execa('glab', [
        'mr',
        'list',
        filter,
        '--per-page',
        String(PER_PAGE),
        '--page',
        String(page),
        '--output',
        'json',
      ]));
    } catch (error) {
      throw glabFailure('glab mr list', error);
    }

    const batch = stdout.trim() ? parseGlabJson<RawMergeRequest[]>('glab mr list', stdout) : [];
    mergeRequests.push(...batch);

    if (batch.length < PER_PAGE) return mergeRequests;
  }

  throw new Error(
    `\`glab mr list ${filter}\` returned more than ${MAX_PAGES * PER_PAGE} MRs. Close or merge some MRs, or check that glab supports \`--page\`.`,
  );
};

export const listMyOpenMergeRequests = async (): Promise<MyMergeRequest[]> => {
  const [assigned, authored] = await Promise.all([
    listOpenMergeRequests('--assignee=@me'),
    listOpenMergeRequests('--author=@me'),
  ]);

  const byIid = new Map<string, MyMergeRequest>();

  for (const mr of [...assigned, ...authored]) {
    const iid = String(mr.iid);
    if (byIid.has(iid)) continue;

    byIid.set(iid, {
      iid,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      sourceProjectId: mr.source_project_id,
      targetProjectId: mr.target_project_id,
      draft: Boolean(mr.draft || mr.work_in_progress),
    });
  }

  return [...byIid.values()];
};
