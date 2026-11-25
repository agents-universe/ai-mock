import type { MockApi, MockApiCreateInput, MockApiUpdateInput } from '@ai-mock/shared';
import { getDb } from '../connection.js';
import { newId, now } from './helpers.js';
import { conflict, notFound } from '../../util/errors.js';

interface ApiRow {
  id: string;
  project_id: string;
  name: string;
  method: string;
  path: string;
  description: string | null;
  enabled: number | boolean;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
  branch_count?: number | string;
}

function map(row: ApiRow): MockApi {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    method: row.method as MockApi['method'],
    path: row.path,
    description: row.description,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.branch_count !== undefined ? { branchCount: Number(row.branch_count) } : {}),
  };
}

export async function listApis(projectId: string): Promise<MockApi[]> {
  const db = getDb();
  const rows = await db<ApiRow>('apis')
    .where({ project_id: projectId })
    .orderBy('sort_order', 'asc');
  // separate grouped count (portable across sqlite/mysql/mssql)
  const countRows = (await db('response_branches')
    .join('apis', 'apis.id', '=', 'response_branches.api_id')
    .where('apis.project_id', projectId)
    .groupBy('response_branches.api_id')
    .select('response_branches.api_id as api_id')
    .count('* as c')) as { api_id: string; c: number | string }[];
  const countMap = new Map(countRows.map((r) => [String(r.api_id), Number(r.c)]));
  return rows.map((row) => ({
    ...map(row),
    branchCount: countMap.get(row.id) ?? 0,
  }));
}

export async function getApiById(id: string): Promise<MockApi | null> {
  const row = await getDb()<ApiRow>('apis').where({ id }).first();
  return row ? map(row) : null;
}

export async function createApi(
  projectId: string,
  input: MockApiCreateInput
): Promise<MockApi> {
  const db = getDb();
  const dup = await db('apis')
    .where({ project_id: projectId, method: input.method, path: input.path })
    .first();
  if (dup) throw conflict('api_exists', `${input.method} ${input.path} 已存在`);
  const maxSort = await db('apis')
    .where({ project_id: projectId })
    .max<{ m: number | null }>('sort_order as m')
    .first();
  const id = newId();
  const ts = now();
  await db('apis').insert({
    id,
    project_id: projectId,
    name: input.name,
    method: input.method,
    path: input.path,
    description: input.description ?? null,
    enabled: input.enabled ?? true,
    sort_order: Number(maxSort?.m ?? -1) + 1,
    created_at: ts,
    updated_at: ts,
  });
  return (await getApiById(id))!;
}

export async function updateApi(id: string, input: MockApiUpdateInput): Promise<MockApi> {
  const db = getDb();
  const existing = await getApiById(id);
  if (!existing) throw notFound('api_not_found', 'API 不存在');
  const newMethod = input.method ?? existing.method;
  const newPath = input.path ?? existing.path;
  if (newMethod !== existing.method || newPath !== existing.path) {
    const dup = await db('apis')
      .where({ project_id: existing.projectId, method: newMethod, path: newPath })
      .whereNot({ id })
      .first();
    if (dup) throw conflict('api_exists', `${newMethod} ${newPath} 已存在`);
  }
  await db('apis')
    .where({ id })
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.path !== undefined ? { path: input.path } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updated_at: now(),
    });
  return (await getApiById(id))!;
}

export async function deleteApi(id: string): Promise<void> {
  const existing = await getApiById(id);
  if (!existing) throw notFound('api_not_found', 'API 不存在');
  await getDb()('apis').where({ id }).delete();
}

export async function reorderApis(projectId: string, ids: string[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (trx) => {
    for (let i = 0; i < ids.length; i++) {
      await trx('apis')
        .where({ id: ids[i], project_id: projectId })
        .update({ sort_order: i, updated_at: now() });
    }
  });
}

/** All enabled APIs of a project for the mock pipeline (with branch counts omitted). */
export async function listApisForMock(projectId: string): Promise<MockApi[]> {
  const rows = await getDb()<ApiRow>('apis')
    .where({ project_id: projectId, enabled: true })
    .orderBy('sort_order', 'asc')
    .select<ApiRow[]>('apis.*');
  return rows.map(map);
}
