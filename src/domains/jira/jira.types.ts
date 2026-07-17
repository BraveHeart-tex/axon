export interface JiraIssuesResponse {
  issues: JiraIssue[];
  isLast: boolean;
}

export interface JiraIssue {
  expand: string;
  id: string;
  self: string;
  key: string;
  fields: JiraIssueFields;
}

interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
  issuetype: JiraIssueType;
}

interface JiraIssueType {
  self: string;
  id: string;
  description: string;
  iconUrl: string;
  name: string;
  subtask: boolean;
}

interface JiraStatus {
  self: string;
  description: string;
  iconUrl: string;
  name: string;
  id: string;
  statusCategory: JiraStatusCategory;
}

interface JiraStatusCategory {
  self: string;
  id: number;
  key: string;
  colorName: string;
  name: string;
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraTransitionTarget;
}

interface JiraTransitionTarget {
  id: string;
  name: string;
}
