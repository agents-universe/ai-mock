import type { FastifyInstance } from 'fastify';
import { projectRoutes } from './projects.js';
import { environmentRoutes } from './environments.js';
import { apiRoutes } from './apis.js';
import { branchRoutes } from './branches.js';
import { settingsRoutes } from './settings.js';
import { previewRoutes } from './preview.js';
import { logRoutes } from './logs.js';
import { tokenRoutes } from './tokens.js';
import { getDb, getCurrentSettings } from '../db/connection.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    let migrations = 'unknown';
    try {
      const [ , log] = await getDb().migrate.latest();
      migrations = log.length > 0 ? `applied ${log.length}` : 'up-to-date';
    } catch (err) {
      migrations = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    return {
      ok: true,
      db: getCurrentSettings()?.client ?? 'unknown',
      migrations,
    };
  });

  await app.register(projectRoutes);
  await app.register(environmentRoutes);
  await app.register(apiRoutes);
  await app.register(branchRoutes);
  await app.register(settingsRoutes);
  await app.register(previewRoutes);
  await app.register(logRoutes);
  await app.register(tokenRoutes);
}
