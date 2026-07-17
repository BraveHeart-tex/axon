import { confirm, select } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateIssueStatus } from '@/domains/feature/flows/updateIssueStatus.flow.js';
import { getIssueTransitions, transitionIssue } from '@/domains/jira/jira.service.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/domains/jira/jira.service.js', () => ({
  getIssueTransitions: vi.fn(),
  transitionIssue: vi.fn(),
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

const mockedConfirm = vi.mocked(confirm);
const mockedSelect = vi.mocked(select);
const mockedGetIssueTransitions = vi.mocked(getIssueTransitions);
const mockedTransitionIssue = vi.mocked(transitionIssue);

const transitions = [
  { id: '11', name: 'Start', to: { id: '3', name: 'In Progress' } },
  { id: '21', name: 'Done', to: { id: '5', name: 'Done' } },
];

describe('updateIssueStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedConfirm.mockResolvedValue(true);
    mockedSelect.mockResolvedValue('11');
    mockedGetIssueTransitions.mockResolvedValue(transitions);
    mockedTransitionIssue.mockResolvedValue(undefined);
  });

  it('skips without prompting when the ticket is already In Progress', async () => {
    await updateIssueStatus('ORD-1325', 'in progress');

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedGetIssueTransitions).not.toHaveBeenCalled();
    expect(mockedTransitionIssue).not.toHaveBeenCalled();
  });

  it('does not fetch transitions when the user declines', async () => {
    mockedConfirm.mockResolvedValueOnce(false);

    await updateIssueStatus('ORD-1325', 'To Do');

    expect(mockedGetIssueTransitions).not.toHaveBeenCalled();
    expect(mockedTransitionIssue).not.toHaveBeenCalled();
  });

  it('warns and does not transition when there are no available transitions', async () => {
    mockedGetIssueTransitions.mockResolvedValueOnce([]);

    await updateIssueStatus('ORD-1325', 'To Do');

    expect(mockedSelect).not.toHaveBeenCalled();
    expect(mockedTransitionIssue).not.toHaveBeenCalled();
  });

  it('transitions the issue with the selected transition id when confirmed', async () => {
    await updateIssueStatus('ORD-1325', 'To Do');

    expect(mockedGetIssueTransitions).toHaveBeenCalledWith('ORD-1325');
    expect(mockedTransitionIssue).toHaveBeenCalledWith('ORD-1325', '11');
  });

  it('does not throw when the transition request fails', async () => {
    mockedTransitionIssue.mockRejectedValueOnce(new Error('403 Forbidden'));

    await expect(updateIssueStatus('ORD-1325', 'To Do')).resolves.toBeUndefined();
  });
});
