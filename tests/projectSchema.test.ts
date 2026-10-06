import { describe, expect, it } from 'vitest';

import { isProjectConfigError } from '@/domains/project/project.errors.js';
import { parseProjectConfig } from '@/domains/project/project.schema.js';

const FILE = '/home/me/.axon/projects/acme__app.json';

const problemsFor = (data: unknown) => {
  try {
    parseProjectConfig(FILE, typeof data === 'string' ? data : JSON.stringify(data));
  } catch (error) {
    if (isProjectConfigError(error)) return error.problems;
    throw error;
  }
  throw new Error('expected the config to be rejected');
};

describe('parseProjectConfig', () => {
  it('applies the flow defaults', () => {
    expect(parseProjectConfig(FILE, JSON.stringify({ version: 1, flow: 'gitflow' }))).toEqual({
      version: 1,
      flow: 'gitflow',
      gitflow: { mainBranch: 'main', developBranch: 'develop', releasePrefix: 'release/' },
    });
    expect(parseProjectConfig(FILE, JSON.stringify({ version: 1, flow: 'classified' }))).toEqual({
      version: 1,
      flow: 'classified',
      classified: { mainBranch: 'main', developBranch: 'develop', qaPassedLabel: 'qa::passed' },
    });
  });

  it('accepts the documented classified example', () => {
    const config = {
      version: 1,
      flow: 'classified',
      classified: { mainBranch: 'main', developBranch: 'develop', qaPassedLabel: 'qa::passed' },
      branchTemplate: '{type}/{key}-{slug}',
      jira: {
        projectKeys: ['PRD', 'FE'],
        inProgressStatus: 'In Progress',
        statusOrder: ['Blocked', 'In Progress', 'In Review', 'To Do', 'Done'],
        jql: 'assignee = currentUser()',
      },
      mode: 'jira',
      aiModel: null,
    };

    expect(parseProjectConfig(FILE, JSON.stringify(config))).toEqual(config);
  });

  it.each([
    ['invalid JSON', '{ "version": 1,', /^.+: \(root\): valid JSON, got a syntax error/],
    ['a non-object root', [], `${FILE}: (root): an object, got an array []`],
    [
      'an unknown version',
      { version: 2, flow: 'gitflow' },
      `${FILE}: version: 1 (the only version this axon supports), got 2`,
    ],
    [
      'a missing version',
      { flow: 'gitflow' },
      `${FILE}: version: 1 (the only version this axon supports), got nothing`,
    ],
    [
      'an unknown flow',
      { version: 1, flow: 'trunk' },
      `${FILE}: flow: one of "gitflow", "classified", got "trunk"`,
    ],
    [
      'a missing flow',
      { version: 1 },
      `${FILE}: flow: one of "gitflow", "classified", got nothing`,
    ],
    [
      'a wrong type',
      { version: 1, flow: 'classified', classified: { mainBranch: 5 } },
      `${FILE}: classified.mainBranch: a string, got 5`,
    ],
    [
      'a branch name with spaces',
      { version: 1, flow: 'gitflow', gitflow: { developBranch: 'my develop' } },
      `${FILE}: gitflow.developBranch: a branch name without spaces, got "my develop"`,
    ],
    [
      'a template without {key}',
      { version: 1, flow: 'gitflow', branchTemplate: '{type}/{slug}' },
      `${FILE}: branchTemplate: a template containing {key} and only {type}, {key}, {slug}, got "{type}/{slug}"`,
    ],
    [
      'a template with an unknown placeholder',
      { version: 1, flow: 'gitflow', branchTemplate: '{user}/{key}' },
      `${FILE}: branchTemplate: a template containing {key} and only {type}, {key}, {slug}, got "{user}/{key}"`,
    ],
    [
      'an unknown mode',
      { version: 1, flow: 'gitflow', mode: 'auto' },
      `${FILE}: mode: one of "jira", "default", got "auto"`,
    ],
    [
      'an unknown AI model',
      { version: 1, flow: 'gitflow', aiModel: 'gpt-9' },
      `${FILE}: aiModel: one of "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", got "gpt-9"`,
    ],
    [
      'a bad Jira key',
      { version: 1, flow: 'gitflow', jira: { projectKeys: ['PRD', 'fe'] } },
      `${FILE}: jira.projectKeys[1]: an uppercase Jira project key such as PRD, got "fe"`,
    ],
    [
      'an empty Jira key list',
      { version: 1, flow: 'gitflow', jira: { projectKeys: [] } },
      `${FILE}: jira.projectKeys: at least one key, got an array []`,
    ],
    [
      'an empty status',
      { version: 1, flow: 'gitflow', jira: { inProgressStatus: ' ' } },
      `${FILE}: jira.inProgressStatus: a non-empty string, got " "`,
    ],
    [
      'an invalid Jira URL',
      { version: 1, flow: 'classified', jira: { cloudUrl: 'not-a-url' } },
      `${FILE}: jira.cloudUrl: a Jira Cloud URL, got "not-a-url"`,
    ],
    [
      'an invalid Jira email',
      { version: 1, flow: 'classified', jira: { email: 'not-an-email' } },
      `${FILE}: jira.email: a valid email address, got "not-an-email"`,
    ],
    [
      'an unknown key',
      { version: 1, flow: 'gitflow', jiraKeys: ['PRD'] },
      `${FILE}: jiraKeys: no such setting, got an array ["PRD"]`,
    ],
    [
      "the other flow's block",
      { version: 1, flow: 'gitflow', classified: {} },
      `${FILE}: classified: no such setting, got an object`,
    ],
  ])('reports %s', (_name, data, expected) => {
    const problems = problemsFor(data);

    expect(problems).toHaveLength(1);
    if (typeof expected === 'string') expect(problems[0]).toBe(expected);
    else expect(problems[0]).toMatch(expected);
  });

  it('lists every problem', () => {
    expect(
      problemsFor({ version: 1, flow: 'gitflow', mode: 'auto', gitflow: { mainBranch: '' } }),
    ).toEqual([
      `${FILE}: mode: one of "jira", "default", got "auto"`,
      `${FILE}: gitflow.mainBranch: a branch name without spaces, got ""`,
    ]);
  });
});
