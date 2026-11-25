import type { FastifyInstance } from 'fastify';
import { projectCreateSchema, projectUpdateSchema } from '@ai-mock/shared';
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  countApisByProject,
  countEnvsByProject,
} from '../db/repos/project-repo.js';
import { bus } from '../db/bus.js';
import { notFound } from '../util/errors.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => {
    const projects = await listProjects();
    return Promise.all(
      projects.map(async (p) => ({
        ...p,
        apiCount: await countApisByProject(p.id),
        envCount: await countEnvsByProject(p.id),
      }))
    );
  });

  app.post('/api/projects', async (req, reply) => {
    const body = projectCreateSchema.parse(req.body);
    const project = await createProject(body);
    reply.status(201);
    return project;
  });

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    const project = await getProjectById(id);
    if (!project) throw notFound('project_not_found', '项目不存在');
    return {
      ...project,
      apiCount: await countApisByProject(project.id),
      envCount: await countEnvsByProject(project.id),
    };
  });

  app.patch('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = projectUpdateSchema.parse(req.body);
    const project = await updateProject(id, body);
    bus.emitConfigChanged({ projectId: project.id });
    return project;
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteProject(id);
    bus.emitConfigChanged({ projectId: id });
    reply.status(204);
    return null;
  });
}
