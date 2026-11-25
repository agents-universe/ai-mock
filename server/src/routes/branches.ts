import type { FastifyInstance } from 'fastify';
import { branchCreateSchema, branchUpdateSchema, branchReorderSchema } from '@ai-mock/shared';
import {
  createBranch,
  updateBranch,
  deleteBranch,
  reorderBranches,
  getBranchById,
} from '../db/repos/branch-repo.js';
import { getApiById } from '../db/repos/api-repo.js';
import { bus } from '../db/bus.js';
import { notFound } from '../util/errors.js';

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/apis/:id/branches', async (req, reply) => {
    const { id } = req.params as { id: string };
    const api = await getApiById(id);
    if (!api) throw notFound('api_not_found', 'API 不存在');
    const body = branchCreateSchema.parse(req.body);
    const branch = await createBranch(id, body);
    bus.emitConfigChanged({ projectId: api.projectId });
    reply.status(201);
    return branch;
  });

  app.patch('/api/branches/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = branchUpdateSchema.parse(req.body);
    const branch = await updateBranch(id, body);
    const api = await getApiById(branch.apiId);
    if (api) bus.emitConfigChanged({ projectId: api.projectId });
    return branch;
  });

  app.delete('/api/branches/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const branch = await getBranchById(id);
    if (!branch) throw notFound('branch_not_found', '响应分支不存在');
    const api = await getApiById(branch.apiId);
    await deleteBranch(id);
    if (api) bus.emitConfigChanged({ projectId: api.projectId });
    reply.status(204);
    return null;
  });

  app.post('/api/branches/reorder', async (req) => {
    const body = branchReorderSchema.parse(req.body);
    const api = await getApiById(body.apiId);
    if (!api) throw notFound('api_not_found', 'API 不存在');
    await reorderBranches(body.apiId, body.ids);
    bus.emitConfigChanged({ projectId: api.projectId });
    return { ok: true };
  });
}
