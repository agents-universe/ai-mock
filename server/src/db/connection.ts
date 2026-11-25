import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knexModule, { type Knex } from 'knex';
import type { DatabaseConnectionSettings } from '@ai-mock/shared';
import { readConnectionSettings } from './connection-file.js';

const knex = (knexModule as unknown as { default?: typeof knexModule }).default ?? knexModule;

let instance: Knex | null = null;
let currentSettings: DatabaseConnectionSettings | null = null;

const selfPath = fileURLToPath(import.meta.url);

function create(settings: DatabaseConnectionSettings): Knex {
  if (settings.client === 'sqlite') {
    const filename = settings.connection.filename;
    if (filename !== ':memory:' && !filename.startsWith('file:')) {
      fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    }
  }
  return knex({
    // map our settings client names to knex driver package names
    client:
      settings.client === 'sqlite'
        ? 'better-sqlite3'
        : settings.client === 'mysql'
          ? 'mysql2'
          : settings.client,
    connection: settings.connection as never,
    migrations: {
      // server always runs from source via tsx — migrations stay .ts in dev and prod
      directory: path.join(path.dirname(selfPath), 'migrations'),
      extension: 'ts',
    },
    // SQLite: allow concurrent reads during writes
    ...(settings.client === 'sqlite' ? { useNullAsDefault: true } : {}),
  } as Knex.Config);
}

export function initKnex(settings?: DatabaseConnectionSettings): Knex {
  if (instance) return instance;
  currentSettings = settings ?? readConnectionSettings();
  instance = create(currentSettings);
  return instance;
}

export function getDb(): Knex {
  if (!instance) return initKnex();
  return instance;
}

export function getCurrentSettings(): DatabaseConnectionSettings | null {
  return currentSettings;
}

export async function runMigrations(): Promise<void> {
  await getDb().migrate.latest();
}

export async function testConnection(
  settings: DatabaseConnectionSettings
): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  const k = create(settings);
  try {
    await k.raw(settings.client === 'sqlite' ? 'select 1' : 'select 1 as ok');
    return { ok: true, message: '连接成功', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  } finally {
    await k.destroy().catch(() => {});
  }
}

// serialize switches: concurrent PUTs must not destroy each other's
// freshly installed connection or interleave settings writes
let switchLock: Promise<unknown> = Promise.resolve();

export function switchConnection(
  settings: DatabaseConnectionSettings
): Promise<void> {
  const run = switchLock.then(
    () => doSwitch(settings),
    () => doSwitch(settings)
  );
  switchLock = run.catch(() => {});
  return run;
}

async function doSwitch(settings: DatabaseConnectionSettings): Promise<void> {
  // validate-then-swap: build + migrate the new connection first so a bad
  // config leaves the current working instance untouched
  const next = create(settings);
  try {
    await next.migrate.latest();
  } catch (err) {
    await next.destroy().catch(() => {});
    throw err;
  }
  // swap the reference BEFORE destroying the old pool: tarn marks a pool
  // destroyed synchronously, so destroying first would make every request
  // that calls getDb() during the await fail with "Unable to acquire"
  const old = instance;
  instance = next;
  currentSettings = settings;
  if (old) {
    // repos capture `const db = getDb()` and use it across awaits — give
    // those in-flight queries a grace period before tearing the pool down
    // (destroy() aborts any acquire that lands after it starts)
    const timer = setTimeout(() => {
      void old.destroy().catch(() => {});
    }, 10_000);
    timer.unref?.();
  }
}

export async function destroyDb(): Promise<void> {
  if (instance) {
    await instance.destroy().catch(() => {});
    instance = null;
    currentSettings = null;
  }
}
