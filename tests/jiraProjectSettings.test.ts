import { input, select, Separator } from '@inquirer/prompts';
import c from 'ansi-colors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildIssueChoices } from '@/domains/feature/feature.formatter.js';
import { resolveIssueKey } from '@/domains/feature/flows/resolveIssueKey.flow.js';
import { buildJiraRegex } from '@/domains/jira/jira.constants.js';
import { getJiraIssues } from '@/domains/jira/jira.service.js';
import type { JiraIssue } from '@/domains/jira/jira.types.js';

import { projectContext } from './helpers/projectContext.js';

vi.mock('@inquirer/prompts', async (original) => ({
  ...(await original<typeof import('@inquirer/prompts')>()),
  input: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@/domains/jira/jira.service.js', () => ({ getJiraIssues: vi.fn() }));

const jira = projectContext({
  version: 1,
  flow: 'classified',
  jira: { projectKeys: ['APP', 'WEB2'], statusOrder: ['Ready', 'Working'] },
}).jira;
const issue = (key: string, status: string) =>
  ({ key, fields: { summary: key, status: { name: status } } }) as JiraIssue;

beforeEach(() => vi.clearAllMocks());

describe('project Jira settings', () => {
  it('extracts only configured keys, including keys containing digits', () => {
    const regex = buildJiraRegex(jira);
    expect('fix/WEB2-12-retry'.match(regex)?.[0]).toBe('WEB2-12');
    expect(regex.test('APP-7')).toBe(true);
    for (const name of ['ORD-7', 'app-7', 'XAPP-7', 'APP-7x']) expect(regex.test(name)).toBe(false);
  });

  it('orders configured statuses and groups all unknown statuses under Other', () => {
    const choices = buildIssueChoices(
      [
        issue('APP-1', 'Done'),
        issue('APP-2', 'Working'),
        issue('APP-3', 'Ready'),
        issue('APP-4', 'QA'),
      ],
      jira.statusOrder,
    );
    expect(
      choices.flatMap((choice) => (choice instanceof Separator ? [] : [choice.value])),
    ).toEqual(['APP-3', 'APP-2', 'APP-1', 'APP-4']);
    const headers = choices
      .filter((choice) => choice instanceof Separator)
      .map((choice) => c.unstyle(choice.separator));
    expect(headers).toEqual([
      expect.stringContaining('READY'),
      expect.stringContaining('WORKING'),
      expect.stringContaining('OTHER'),
      ' ',
    ]);
    expect(headers[2]).toContain('(2)');
  });

  it('keeps Other last even when explicitly listed earlier', () => {
    const choices = buildIssueChoices(
      [issue('APP-1', 'QA'), issue('APP-2', 'Ready')],
      ['Other', 'Ready'],
    );
    expect(
      choices.flatMap((choice) => (choice instanceof Separator ? [] : [choice.value])),
    ).toEqual(['APP-2', 'APP-1']);
  });

  it('validates the whole manually entered key against project keys', async () => {
    vi.mocked(input).mockResolvedValue('APP-7');
    expect(await resolveIssueKey('default', jira)).toEqual({ issueKey: 'APP-7' });
    const options = vi.mocked(input).mock.calls[0]![0];
    expect(options.message).toContain('APP-1325');
    expect(await options.validate?.('WEB2-12')).toBe(true);
    for (const key of ['ORD-7', 'prefix APP-7', 'APP-7 suffix'])
      expect(await options.validate?.(key)).not.toBe(true);
  });

  it('keeps issues with unknown statuses selectable in the Jira picker', async () => {
    vi.mocked(getJiraIssues).mockResolvedValue([issue('APP-7', 'QA')]);
    vi.mocked(select).mockResolvedValue('APP-7');
    expect(await resolveIssueKey('jira', jira)).toMatchObject({
      issueKey: 'APP-7',
      currentStatus: 'QA',
    });
    expect(vi.mocked(select).mock.calls[0]![0].choices).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'APP-7' })]),
    );
  });
});
