import type { DatabaseClient } from '../constants.js';

export interface SqliteConnectionSettings {
  client: 'sqlite';
  connection: { filename: string };
}

export interface MysqlConnectionSettings {
  client: 'mysql';
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
}

export interface MssqlConnectionSettings {
  client: 'mssql';
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    options?: { encrypt?: boolean; trustServerCertificate?: boolean };
  };
}

export type DatabaseConnectionSettings =
  | SqliteConnectionSettings
  | MysqlConnectionSettings
  | MssqlConnectionSettings;

export type { DatabaseClient };
