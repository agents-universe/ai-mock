import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCreateSchema, apiUpdateSchema } from '@ai-mock/shared';
import {
  listApis,
  getApiById,
  updateApi,
  deleteApi,
} from '../../db/repos/api-repo.js';
import { listBranches } from '../../db/repos/branch-repo.js';
import { getProjectById } from '../../db/repos/project-repo.js';
import { bus } from '../../db/bus.js';
import { notFound } from '../../util/errors.js';
import {
  assertCompilablePath,
  createApiWithDefaultBranch,
} from '../../services/api-service.js';
import { toolHandler } from './helpers.js';

export function registerApiTools(server: McpServer): void {
  server.registerTool(
    'list_apis',
    {
      description: 'List APIs of a project (method, path, enabled, branch count).',
      inputSchema: { projectId: z.string().min(1).describe('Project id') },
    },
    toolHandler(async ({ projectId }) => {
      const project = await getProjectById(projectId);
      if (!project) throw notFound('project_not_found', '项目不存在');
      return listApis(projectId);
    })
  );

  server.registerTool(
    'create_api',
    {
      description:
        'Create a mock API under a project, together with a default always-200 branch. ' +
        'path supports :params and * wildcards, e.g. /api/users/:id. ' +
        'Mock URL: /mock/{projectSlug}/{envSlug}' + '{path}',
      inputSchema: {
        projectId: z.string().min(1).describe('Project id'),
        ...apiCreateSchema.shape,
      },
    },
    toolHandler(async ({ projectId, ...body }) => {
      const project = await getProjectById(projectId);
      if (!project) throw notFound('project_not_found', '项目不存在');
      return createApiWithDefaultBranch(projectId, apiCreateSchema.parse(body));
    })
  );

  server.registerTool(
    'get_api',
    {
      description: 'Get one API by id, including all of its response branches in evaluation order.',
      inputSchema: { id: z.string().min(1).describe('API id') },
    },
    toolHandler(async ({ id }) => {
      const api = await getApiById(id);
      if (!api) throw notFound('api_not_found', 'API 不存在');
      const branches = await listBranches(id);
      return { ...api, branches };
    })
  );

  server.registerTool(
    'update_api',
    {
      description: 'Update API fields (partial: name/method/path/enabled/…). Invalidates cache.',
      inputSchema: {
        id: z.string().min(1).describe('API id'),
        ...apiUpdateSchema.shape,
      },
    },
    toolHandler(async ({ id, ...patch }) => {
      const valid = apiUpdateSchema.parse(patch);
      if (valid.path !== undefined) assertCompilablePath(valid.path);
      const api = await updateApi(id, valid);
      bus.emitConfigChanged({ projectId: api.projectId });
      return api;
    })
  );

  server.registerTool(
    'delete_api',
    {
      description: 'Delete an API and all of its branches.',
      inputSchema: { id: z.string().min(1).describe('API id') },
    },
    toolHandler(async ({ id }) => {
      const api = await getApiById(id);
      if (!api) throw notFound('api_not_found', 'API 不存在');
      await deleteApi(id);
      bus.emitConfigChanged({ projectId: api.projectId });
      return { deleted: true, id };
    })
  );
}
