// Cross-dialect runs: pre-set AIMOCK_DB_* env to target mysql/mssql (see README).
process.env.AIMOCK_DB_CLIENT ??= 'sqlite';
if (process.env.AIMOCK_DB_CLIENT === 'sqlite') {
  process.env.AIMOCK_DB_FILENAME ??= ':memory:';
}
process.env.NODE_ENV = 'test';
// isolate tokens.json/connection.json side effects from the repo's real data dir
process.env.AIMOCK_DATA_DIR ??= `${process.env.TEMP ?? '/tmp'}/ai-mock-test-data-${process.pid}`;

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import {
  initKnex,
  runMigrations,
  destroyDb,
  getDb,
} from '../../server/src/db/connection.js';
import { invalidateAll } from '../../server/src/db/cache.js';

export interface TestEnv {
  app: FastifyInstance;
}

export async function setupApp(): Promise<TestEnv> {
  await destroyDb();
  initKnex();
  // persistent server DBs: reset schema so each run starts clean
  if (process.env.AIMOCK_DB_CLIENT !== 'sqlite') {
    try {
      await getDb().migrate.forceFree();
    } catch {
      /* no lock table yet */
    }
    try {
      await getDb().migrate.rollback({}, true);
    } catch {
      /* empty schema */
    }
  }
  await runMigrations();
  invalidateAll();
  const app = await buildApp({ serveWeb: false });
  await app.ready();
  return { app };
}

export async function teardownApp(env?: TestEnv): Promise<void> {
  if (env?.app) await env.app.close();
  await destroyDb();
}

export interface InjectResponse {
  status: number;
  body: any;
  headers: Record<string, any>;
}

/**
 * supertest-like wrapper over Fastify's app.inject().
 * Usage: await request(app).post('/api/x').send({...})
 */
export function request(app: FastifyInstance) {
  const make = (method: string, url: string) => {
    const state = { headers: {} as Record<string, string>, payload: undefined as unknown };
    const chain = {
      set(key: string, value: string) {
        state.headers[key] = value;
        return chain;
      },
      send(payload: unknown) {
        state.payload = payload;
        return chain;
      },
      then(onFulfilled: any, onRejected: any) {
        return chain.run().then(onFulfilled, onRejected);
      },
      catch(onRejected: any) {
        return chain.run().catch(onRejected);
      },
      async run(): Promise<InjectResponse> {
        const res = await app.inject({
          method: method as any,
          url,
          headers: state.headers,
          payload: state.payload as any,
        });
        let body: any;
        try {
          body = res.body.length > 0 ? res.json() : null;
        } catch {
          body = res.body;
        }
        return { status: res.statusCode, body, headers: res.headers as any };
      },
    };
    return chain;
  };
  return {
    get: (url: string) => make('GET', url),
    post: (url: string) => make('POST', url),
    put: (url: string) => make('PUT', url),
    patch: (url: string) => make('PATCH', url),
    delete: (url: string) => make('DELETE', url),
  };
}
