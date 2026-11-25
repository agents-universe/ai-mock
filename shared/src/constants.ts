export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const RESERVED_PREFIXES = ['/api', '/mock', '/health'] as const;

export const BODY_TYPES = ['static', 'script'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const CONDITION_TYPES = ['always', 'rules', 'expression'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const DATABASE_CLIENTS = ['sqlite', 'mysql', 'mssql'] as const;
export type DatabaseClient = (typeof DATABASE_CLIENTS)[number];

export const MAX_DELAY_MS = 60_000;
export const SCRIPT_TIMEOUT_MS = 2_000;
export const EXPRESSION_TIMEOUT_MS = 1_000;
export const MAX_BODY_BYTES = 1024 * 1024;
export const CACHE_TTL_MS = 5_000;
