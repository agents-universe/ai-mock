import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseConnectionSettings } from '@ai-mock/shared';
import { config } from '../config.js';

export const DEFAULT_SETTINGS: DatabaseConnectionSettings = {
  client: 'sqlite',
  connection: { filename: path.join(config.dataDir, 'ai-mock.sqlite') },
};

function connectionFilePath(): string {
  return path.join(config.dataDir, 'connection.json');
}

function fromEnv(): DatabaseConnectionSettings | null {
  const client = process.env.AIMOCK_DB_CLIENT;
  if (!client) return null;
  if (client === 'sqlite') {
    return {
      client: 'sqlite',
      connection: {
        filename:
          process.env.AIMOCK_DB_FILENAME ?? path.join(config.dataDir, 'ai-mock.sqlite'),
      },
    };
  }
  if (client === 'mysql') {
    return {
      client: 'mysql',
      connection: {
        host: process.env.AIMOCK_DB_HOST ?? '127.0.0.1',
        port: Number(process.env.AIMOCK_DB_PORT ?? 3306),
        user: process.env.AIMOCK_DB_USER ?? 'root',
        password: process.env.AIMOCK_DB_PASSWORD ?? '',
        database: process.env.AIMOCK_DB_DATABASE ?? 'ai_mock',
      },
    };
  }
  if (client === 'mssql') {
    return {
      client: 'mssql',
      connection: {
        host: process.env.AIMOCK_DB_HOST ?? '127.0.0.1',
        port: Number(process.env.AIMOCK_DB_PORT ?? 1433),
        user: process.env.AIMOCK_DB_USER ?? 'sa',
        password: process.env.AIMOCK_DB_PASSWORD ?? '',
        database: process.env.AIMOCK_DB_DATABASE ?? 'ai_mock',
        options: {
          encrypt: process.env.AIMOCK_DB_ENCRYPT === 'true',
          trustServerCertificate: process.env.AIMOCK_DB_TRUST !== 'false',
        },
      },
    };
  }
  return null;
}

/** true when AIMOCK_DB_* env vars actually take precedence over connection.json */
export function isEnvManaged(): boolean {
  return fromEnv() !== null;
}

export function readConnectionSettings(): DatabaseConnectionSettings {
  const env = fromEnv();
  if (env) return env;
  const file = connectionFilePath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as DatabaseConnectionSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeConnectionSettings(settings: DatabaseConnectionSettings): void {
  const file = connectionFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
}
