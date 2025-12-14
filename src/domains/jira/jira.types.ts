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
