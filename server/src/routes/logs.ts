import type { FastifyInstance } from 'fastify';
import { logQuerySchema } from '@ai-mock/shared';
import { listLogs, type LogQuery } from '../db/repos/log-repo.js';
import { getProjectById } from '../db/repos/project-repo.js';
import { notFound } from '../util/errors.js';

/** Map the query-string enum ('true'/'false') to the boolean the repo wants. */
export function toLogQuery(raw: unknown): LogQuery {
  const q = logQuerySchema.parse(raw);
  const { matched, ...rest } = q;
  return { ...rest, ...(matched !== undefined ? { matched: matched === 'true' } : {}) };
}

export async function logRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:id/logs', async (req) => {
    const { id } = req.params as { id: string };
    const project = await getProjectById(id);
    if (!project) throw notFound('project_not_found', '项目不存在');
    return listLogs(id, toLogQuery(req.query ?? {}));
  });
}
