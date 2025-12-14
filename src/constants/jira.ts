export const JIRA_REGEX = /^(FE|ORD|DIS|PE|PRD|MEM|MOD)-[0-9]+$/;
export const JIRA_CLOUD_URL_REGEX =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net(?:\/.*)?$/;

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

export interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
}

export interface JiraStatus {
  self: string;
  description: string;
  iconUrl: string;
  name: string;
  id: string;
  statusCategory: JiraStatusCategory;
}

export interface JiraStatusCategory {
  self: string;
  id: number;
  key: string;
  colorName: string;
  name: string;
}
