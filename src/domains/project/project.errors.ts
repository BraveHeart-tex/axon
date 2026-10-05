interface ProjectConfigError extends Error {
  isProjectConfigError: true;
  problems: string[];
}

export const createProjectConfigError = (problems: string[]): ProjectConfigError => {
  const error = new Error(problems.join('\n')) as ProjectConfigError;
  error.name = 'ProjectConfigError';
  error.isProjectConfigError = true;
  error.problems = problems;
  return error;
};

export const isProjectConfigError = (error: unknown): error is ProjectConfigError =>
  error instanceof Error && (error as Partial<ProjectConfigError>).isProjectConfigError === true;
