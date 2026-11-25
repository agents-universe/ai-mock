import type { FastifyInstance } from 'fastify';
import { environmentCreateSchema, environmentUpdateSchema } from '@ai-mock/shared';
import {
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  getEnvironmentById,
} from '../db/repos/environment-repo.js';
import { getProjectById } from '../db/repos/project-repo.js';
import { bus } from '../db/bus.js';
import { notFound } from '../util/errors.js';

export async function environmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:id/environments', async (req) => {
    const { id } = req.params as { id: string };
    const project = await getProjectById(id);
    if (!project) throw notFound('project_not_found', '项目不存在');
    return listEnvironments(id);
  });

  app.post('/api/projects/:id/environments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await getProjectById(id);
    if (!project) throw notFound('project_not_found', '项目不存在');
    const body = environmentCreateSchema.parse(req.body);
    const env = await createEnvironment(id, body);
    bus.emitConfigChanged({ projectId: id });
    reply.status(201);
    return env;
  });

  app.patch('/api/environments/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = environmentUpdateSchema.parse(req.body);
    const env = await updateEnvironment(id, body);
    bus.emitConfigChanged({ projectId: env.projectId });
    return env;
  });

  app.delete('/api/environments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const env = await getEnvironmentById(id);
    if (!env) throw notFound('environment_not_found', '环境不存在');
    await deleteEnvironment(id);
    bus.emitConfigChanged({ projectId: env.projectId });
    reply.status(204);
    return null;
  });
}
