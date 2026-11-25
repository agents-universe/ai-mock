import type { FastifyInstance } from 'fastify';
import { apiCreateSchema, apiUpdateSchema, reorderSchema } from '@ai-mock/shared';
import {
  listApis,
  getApiById,
  updateApi,
  deleteApi,
  reorderApis,
} from '../db/repos/api-repo.js';
import { listBranches } from '../db/repos/branch-repo.js';
import { getProjectById } from '../db/repos/project-repo.js';
import { bus } from '../db/bus.js';
import { notFound } from '../util/errors.js';
import {
  assertCompilablePath,
  createApiWithDefaultBranch,
} from '../services/api-service.js';

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:id/apis', async (req) => {
    const { id } = req.params as { id: string };
    const project = await getProjectById(id);
    if (!project) throw notFound('project_not_found', '项目不存在');
    return listApis(id);
  });

  app.post('/api/projects/:id/apis', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await getProjectById(id);
    if (!project) throw notFound('project_not_found', '项目不存在');
    const body = apiCreateSchema.parse(req.body);
    const api = await createApiWithDefaultBranch(id, body);
    reply.status(201);
    return api;
  });

  app.get('/api/apis/:id', async (req) => {
    const { id } = req.params as { id: string };
    const api = await getApiById(id);
    if (!api) throw notFound('api_not_found', 'API 不存在');
    const branches = await listBranches(id);
    return { ...api, branches };
  });

  app.patch('/api/apis/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = apiUpdateSchema.parse(req.body);
    if (body.path !== undefined) assertCompilablePath(body.path);
    const api = await updateApi(id, body);
    bus.emitConfigChanged({ projectId: api.projectId });
    return api;
  });

  app.delete('/api/apis/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const api = await getApiById(id);
    if (!api) throw notFound('api_not_found', 'API 不存在');
    await deleteApi(id);
    bus.emitConfigChanged({ projectId: api.projectId });
    reply.status(204);
    return null;
  });

  app.post('/api/apis/:id/reorder', async (req) => {
    const { id } = req.params as { id: string };
    const body = reorderSchema.parse(req.body);
    const api = await getApiById(id);
    if (!api) throw notFound('api_not_found', 'API 不存在');
    await reorderApis(api.projectId, body.ids);
    bus.emitConfigChanged({ projectId: api.projectId });
    return { ok: true };
  });
}
