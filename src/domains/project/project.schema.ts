import { z } from 'zod';

import { AI_MODELS } from '@/domains/ai/ai.constants.js';
import { JIRA_CLOUD_URL_REGEX } from '@/domains/jira/jira.constants.js';
import { CLI_MODES } from '@/domains/mode/mode.constants.js';

import {
  BRANCH_TEMPLATE_PLACEHOLDERS,
  CLASSIFIED_DEFAULTS,
  FLOWS,
  GITFLOW_DEFAULTS,
  PROJECT_CONFIG_VERSION,
} from './project.constants.js';
import { createProjectConfigError } from './project.errors.js';

const BRANCH_NAME_EXPECTED = 'a branch name without spaces';
const BRANCH_TEMPLATE_EXPECTED = `a template containing {key} and only ${BRANCH_TEMPLATE_PLACEHOLDERS.join(', ')}`;
const JIRA_PROJECT_KEY_EXPECTED = 'an uppercase Jira project key such as PRD';
const NON_EMPTY_EXPECTED = 'a non-empty string';

const nonEmptyString = z.string().trim().min(1, { error: NON_EMPTY_EXPECTED });

export const branchNameSchema = z.string().regex(/^\S+$/, { error: BRANCH_NAME_EXPECTED });

const hasOnlyKnownPlaceholders = (template: string) =>
  (template.match(/\{[^}]*\}/g) ?? []).every((placeholder) =>
    (BRANCH_TEMPLATE_PLACEHOLDERS as readonly string[]).includes(placeholder),
  );

export const branchTemplateSchema = z
  .string()
  .refine((template) => template.includes('{key}') && hasOnlyKnownPlaceholders(template), {
    error: BRANCH_TEMPLATE_EXPECTED,
  });

export const jiraProjectKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, { error: JIRA_PROJECT_KEY_EXPECTED });

const jiraSchema = z.strictObject({
  projectKeys: z.array(jiraProjectKeySchema).min(1, { error: 'at least one key' }).optional(),
  inProgressStatus: nonEmptyString.optional(),
  statusOrder: z.array(nonEmptyString).optional(),
  jql: z.string().optional(),
  cloudUrl: z.string().regex(JIRA_CLOUD_URL_REGEX, { error: 'a Jira Cloud URL' }).optional(),
  email: z.email({ error: 'a valid email address' }).optional(),
});

const baseShape = {
  version: z.literal(PROJECT_CONFIG_VERSION),
  branchTemplate: branchTemplateSchema.optional(),
  jira: jiraSchema.optional(),
  mode: z.enum([CLI_MODES.JIRA, CLI_MODES.DEFAULT]).optional(),
  aiModel: z.enum(Object.values(AI_MODELS)).nullable().optional(),
};

const gitflowSchema = z.strictObject({
  ...baseShape,
  flow: z.literal(FLOWS.GITFLOW),
  gitflow: z
    .strictObject({
      mainBranch: branchNameSchema.default(GITFLOW_DEFAULTS.mainBranch),
      developBranch: branchNameSchema.default(GITFLOW_DEFAULTS.developBranch),
      releasePrefix: branchNameSchema.default(GITFLOW_DEFAULTS.releasePrefix),
    })
    .prefault({}),
});

const classifiedSchema = z.strictObject({
  ...baseShape,
  flow: z.literal(FLOWS.CLASSIFIED),
  classified: z
    .strictObject({
      mainBranch: branchNameSchema.default(CLASSIFIED_DEFAULTS.mainBranch),
      developBranch: branchNameSchema.default(CLASSIFIED_DEFAULTS.developBranch),
      qaPassedLabel: nonEmptyString.default(CLASSIFIED_DEFAULTS.qaPassedLabel),
    })
    .prefault({}),
});

const projectConfigSchema = z.discriminatedUnion('flow', [gitflowSchema, classifiedSchema]);

export type ProjectConfig = z.output<typeof projectConfigSchema>;

export type ProjectConfigInput = z.input<typeof projectConfigSchema>;

type Issue = z.core.$ZodIssue;

const formatKey = (keyPath: PropertyKey[]) =>
  keyPath.length === 0
    ? '(root)'
    : keyPath
        .map((part, index) =>
          typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
        )
        .join('');

const valueAt = (data: unknown, keyPath: PropertyKey[]): unknown =>
  keyPath.reduce<unknown>(
    (current, part) =>
      current !== null && typeof current === 'object'
        ? (current as Record<PropertyKey, unknown>)[part]
        : undefined,
    data,
  );

const describeValue = (value: unknown) => {
  if (value === undefined) return 'nothing';
  if (Array.isArray(value)) return `an array ${JSON.stringify(value)}`;
  if (value !== null && typeof value === 'object') return 'an object';
  return JSON.stringify(value);
};

const quoteAll = (values: readonly unknown[]) =>
  values.map((value) => JSON.stringify(value)).join(', ');

const describeExpected = (issue: Issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return `${issue.expected === 'array' || issue.expected === 'object' ? 'an' : 'a'} ${issue.expected}`;
    case 'invalid_value':
      return issue.values.length === 1
        ? JSON.stringify(issue.values[0])
        : `one of ${quoteAll(issue.values)}`;
    case 'invalid_union':
      return `one of ${quoteAll(Object.values(FLOWS))}`;
    default:
      return issue.message;
  }
};

const formatIssue = (configPath: string, data: unknown, issue: Issue): string[] => {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map(
      (key) =>
        `${configPath}: ${formatKey([...issue.path, key])}: no such setting, got ${describeValue(
          valueAt(data, [...issue.path, key]),
        )}`,
    );
  }

  return [
    `${configPath}: ${formatKey(issue.path)}: ${describeExpected(issue)}, got ${describeValue(
      valueAt(data, issue.path),
    )}`,
  ];
};

export const parseProjectConfig = (configPath: string, text: string): ProjectConfig => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw createProjectConfigError([
      `${configPath}: (root): valid JSON, got a syntax error (${(error as Error).message})`,
    ]);
  }

  return validateProjectConfig(configPath, data);
};

export const validateProjectConfig = (configPath: string, data: unknown): ProjectConfig => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw createProjectConfigError([
      `${configPath}: (root): an object, got ${describeValue(data)}`,
    ]);
  }

  const version = (data as { version?: unknown }).version;
  if (version !== PROJECT_CONFIG_VERSION) {
    throw createProjectConfigError([
      `${configPath}: version: ${PROJECT_CONFIG_VERSION} (the only version this axon supports), got ${describeValue(version)}`,
    ]);
  }

  const result = projectConfigSchema.safeParse(data);
  if (result.success) return result.data;

  throw createProjectConfigError(
    result.error.issues.flatMap((issue) => formatIssue(configPath, data, issue)),
  );
};
