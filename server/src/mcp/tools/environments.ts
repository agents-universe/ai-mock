import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { environmentCreateSchema, environmentUpdateSchema } from '@ai-mock/shared';
import {
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  getEnvironmentById,
} from '../../db/repos/environment-repo.js';
import { getProjectById } from '../../db/repos/project-repo.js';
import { bus } from '../../db/bus.js';
import { notFound } from '../../util/errors.js';
import { toolHandler } from './helpers.js';

export function registerEnvironmentTools(server: McpServer): void {
  server.registerTool(
    'list_environments',
    {
      description:
        'List environments of a project. Environment variables are readable in response scripts as env.KEY.',
      inputSchema: { projectId: z.string().min(1).describe('Project id') },
    },
    toolHandler(async ({ projectId }) => {
      const project = await getProjectById(projectId);
      if (!project) throw notFound('project_not_found', '项目不存在');
      return listEnvironments(projectId);
    })
  );

  server.registerTool(
    'create_environment',
    {
      description:
        'Create an environment (e.g. dev/test) for a project. slug appears in mock URLs as /mock/{projectSlug}/{envSlug}/…',
      inputSchema: {
        projectId: z.string().min(1).describe('Project id'),
        ...environmentCreateSchema.shape,
      },
    },
    toolHandler(async ({ projectId, ...body }) => {
      const project = await getProjectById(projectId);
      if (!project) throw notFound('project_not_found', '项目不存在');
      const env = await createEnvironment(
        projectId,
        environmentCreateSchema.parse(body)
      );
      bus.emitConfigChanged({ projectId });
      return env;
    })
  );

  server.registerTool(
    'update_environment',
    {
      description:
        'Update environment fields (partial), including env variables. Invalidates the mock config cache.',
      inputSchema: {
        id: z.string().min(1).describe('Environment id'),
        ...environmentUpdateSchema.shape,
      },
    },
    toolHandler(async ({ id, ...patch }) => {
      const env = await updateEnvironment(id, environmentUpdateSchema.parse(patch));
      bus.emitConfigChanged({ projectId: env.projectId });
      return env;
    })
  );

  server.registerTool(
    'delete_environment',
    {
      description: 'Delete an environment.',
      inputSchema: { id: z.string().min(1).describe('Environment id') },
    },
    toolHandler(async ({ id }) => {
      const env = await getEnvironmentById(id);
      if (!env) throw notFound('environment_not_found', '环境不存在');
      await deleteEnvironment(id);
      bus.emitConfigChanged({ projectId: env.projectId });
      return { deleted: true, id };
    })
  );
}
