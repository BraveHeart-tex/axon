import {
  type ProjectConfigInput,
  validateProjectConfig,
} from '@/domains/project/project.schema.js';
import { buildProjectContext } from '@/domains/project/project.service.js';

export const projectContext = (project?: ProjectConfigInput) =>
  buildProjectContext({
    id: project ? 'test' : null,
    configPath: project ? '/tmp/axon-test.json' : null,
    project: project ? validateProjectConfig('/tmp/axon-test.json', project) : null,
    global: { mode: 'default', jiraCloudUrl: '', jiraJql: '', jiraEmail: '', aiModel: '' },
    env: {},
  });
