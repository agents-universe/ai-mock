import type { FastifyInstance } from 'fastify';
import { databaseSettingsSchema, type DatabaseConnectionSettings } from '@ai-mock/shared';
import {
  readConnectionSettings,
  writeConnectionSettings,
  isEnvManaged,
} from '../db/connection-file.js';
import {
  getCurrentSettings,
  switchConnection,
  testConnection,
} from '../db/connection.js';
import { invalidateAll } from '../db/cache.js';
import { badRequest } from '../util/errors.js';

function mask(settings: DatabaseConnectionSettings) {
  if (settings.client === 'sqlite') return { ...settings };
  return {
    ...settings,
    connection: { ...settings.connection, password: settings.connection.password ? '******' : '' },
  };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/database', async () => {
    const settings = getCurrentSettings() ?? readConnectionSettings();
    // AIMOCK_DB_* env vars take precedence over connection.json on every
    // restart — surface the source so the UI can warn that saves won't
    // persist across restarts. Must use the same validity check as
    // fromEnv() (a typo'd AIMOCK_DB_CLIENT falls back to the file).
    const source = isEnvManaged() ? 'env' : 'file';
    return { settings: mask(settings), source };
  });

  app.put('/api/settings/database', async (req) => {
    const body = databaseSettingsSchema.parse(req.body);
    // if password is masked, keep the existing one
    if (body.client !== 'sqlite' && body.connection.password === '******') {
      const current = getCurrentSettings() ?? readConnectionSettings();
      if (current.client === body.client) {
        (body.connection as { password: string }).password = current.connection.password;
      }
    }
    try {
      await switchConnection(body);
    } catch (err) {
      // keep the old connection; tell the user which side failed
      throw badRequest(
        'db_switch_failed',
        `连接或迁移失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    writeConnectionSettings(body);
    invalidateAll();
    return { ok: true, settings: mask(body) };
  });

  app.post('/api/settings/database/test', async (req) => {
    const body = databaseSettingsSchema.parse(req.body);
    if (body.client !== 'sqlite' && body.connection.password === '******') {
      const current = getCurrentSettings() ?? readConnectionSettings();
      if (current.client === body.client) {
        (body.connection as { password: string }).password = current.connection.password;
      }
    }
    return testConnection(body);
  });
}
