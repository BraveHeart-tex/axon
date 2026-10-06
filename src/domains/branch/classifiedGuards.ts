import { confirm } from '@inquirer/prompts';
import { execa } from 'execa';

import {
  getGitConfigValue,
  isAncestor,
  remoteTrackingBranchExists,
} from '@/domains/git/git.service.js';
import type { FlowSettings } from '@/domains/project/project.types.js';
import { logger } from '@/infra/logger.js';

const gitOutput = async (...args: string[]) => (await execa('git', args)).stdout;

const listCommits = async (base: string) => {
  const output = await gitOutput(
    'log',
    '--format=%H%x00%ae%x00%P%x00%s%x00%(trailers:key=Staging-MR)%x1e',
    `${base}..HEAD`,
  );
  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, email, parents, subject, trailer] = line.split('\0');
      return { sha, email, parents, subject, trailer };
    });
};

export const detectClassifiedParent = async (currentBranch: string, flow: FlowSettings) => {
  const output = await gitOutput(
    'for-each-ref',
    '--format=%(refname:strip=3)',
    '--merged=HEAD',
    `--no-merged=origin/${flow.mainBranch}`,
    'refs/remotes/origin',
  );
  const candidates = output
    .split('\n')
    .filter(
      (name) =>
        name && ![flow.mainBranch, flow.developBranch, currentBranch, 'HEAD'].includes(name),
    );
  for (const candidate of candidates) {
    const ancestors = await Promise.all(
      candidates.map((other) => isAncestor(`origin/${other}`, `origin/${candidate}`)),
    );
    if (ancestors.every(Boolean)) return { parent: candidate, candidates };
  }
  return { parent: undefined, candidates };
};

export const checkClassifiedMrTarget = async (branch: string, flow: FlowSettings) => {
  let mr: { iid?: number | string; target_branch?: string };
  try {
    const auth = await execa('glab', ['auth', 'status'], { reject: false, timeout: 10000 });
    if (auth.exitCode !== 0) return;
    const { stdout } = await execa('glab', ['mr', 'view', branch, '-F', 'json'], {
      timeout: 10000,
    });
    mr = JSON.parse(stdout);
    if (!mr || typeof mr.target_branch !== 'string') return;
  } catch {
    return;
  }
  if (mr.target_branch === flow.developBranch) {
    throw new Error(`Retarget !${mr.iid} to ${flow.mainBranch} in GitLab, then run axon sb.`);
  }
};

export const checkClassifiedCommits = async (target: string, flow: FlowSettings) => {
  if (!(await remoteTrackingBranchExists(flow.mainBranch))) {
    throw new Error(
      `origin/${flow.mainBranch} not found. Check the configured main branch and fetch origin, then run axon sb.`,
    );
  }
  const commits = await listCommits(`origin/${flow.mainBranch}`);
  const develop = (await remoteTrackingBranchExists(flow.developBranch))
    ? new Set(
        (
          await gitOutput('rev-list', `origin/${flow.mainBranch}..origin/${flow.developBranch}`)
        ).split('\n'),
      )
    : new Set<string>();
  const offending = commits.filter((commit) => commit.trailer || develop.has(commit.sha));
  if (offending.length) {
    throw new Error(
      `Branch contains develop commits:\n${offending.map(({ sha, subject }) => `${sha.slice(0, 12)} ${subject}`).join('\n')}\nRun git rebase -i origin/${flow.mainBranch}, drop the listed commits, then run axon sb.`,
    );
  }
  if (target !== flow.mainBranch) return true;
  const email = await getGitConfigValue('user.email');
  const foreign = commits.filter((commit) => commit.email !== email);
  if (!foreign.length) return true;
  logger.warn(
    `${foreign.length} commits by other authors will be rebased onto ${flow.mainBranch}.`,
  );
  return confirm({
    message: `${foreign.length} commits by other authors will be rebased onto ${flow.mainBranch} - is this branch based on a teammate's? Continue?`,
    default: false,
  });
};

export const checkClassifiedPush = async (target: string) => {
  const offending = (await listCommits(`origin/${target}`)).filter(
    ({ subject, parents }) =>
      /^(fixup!|squash!|amend!) /.test(subject) || parents.split(' ').length > 1,
  );
  if (offending.length) {
    throw new Error(
      `Not pushing: fixup or merge commits remain:\n${offending.map(({ sha, subject }) => `${sha.slice(0, 12)} ${subject}`).join('\n')}\nRun git rebase -i --autosquash origin/${target}, remove merge commits, then run axon sb.`,
    );
  }
};
