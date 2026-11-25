import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { branchCreateSchema, branchUpdateSchema } from '@ai-mock/shared';
import {
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchById,
} from '../../db/repos/branch-repo.js';
import { getApiById } from '../../db/repos/api-repo.js';
import { bus } from '../../db/bus.js';
import { notFound } from '../../util/errors.js';
import { toolHandler } from './helpers.js';

export function registerBranchTools(server: McpServer): void {
  server.registerTool(
    'create_branch',
    {
      description:
        'Create a response branch on an API. Branches are evaluated in order: non-default first, ' +
        'then the default branch. conditionType: always | rules | expression. ' +
        'bodyType: static (staticBody) | script (script, sandboxed JS with req/env/faker/helpers).',
      inputSchema: {
        apiId: z.string().min(1).describe('API id'),
        ...branchCreateSchema.shape,
      },
    },
    toolHandler(async ({ apiId, ...body }) => {
      const api = await getApiById(apiId);
      if (!api) throw notFound('api_not_found', 'API 不存在');
      const branch = await createBranch(apiId, branchCreateSchema.parse(body));
      bus.emitConfigChanged({ projectId: api.projectId });
      return branch;
    })
  );

  server.registerTool(
    'update_branch',
    {
      description:
        'Update a response branch (partial): condition, status code, headers, delay, ' +
        'static body or script. Invalidates the mock config cache.',
      inputSchema: {
        id: z.string().min(1).describe('Branch id'),
        ...branchUpdateSchema.shape,
      },
    },
    toolHandler(async ({ id, ...patch }) => {
      const branch = await updateBranch(id, branchUpdateSchema.parse(patch));
      const api = await getApiById(branch.apiId);
      if (api) bus.emitConfigChanged({ projectId: api.projectId });
      return branch;
    })
  );

  server.registerTool(
    'delete_branch',
    {
      description: 'Delete a response branch.',
      inputSchema: { id: z.string().min(1).describe('Branch id') },
    },
    toolHandler(async ({ id }) => {
      const branch = await getBranchById(id);
      if (!branch) throw notFound('branch_not_found', '响应分支不存在');
      const api = await getApiById(branch.apiId);
      await deleteBranch(id);
      if (api) bus.emitConfigChanged({ projectId: api.projectId });
      return { deleted: true, id };
    })
  );
}
