import type { Environment, EnvironmentCreateInput, EnvironmentUpdateInput } from '@ai-mock/shared';
import { getDb } from '../connection.js';
import { newId, now, readJson, writeJson } from './helpers.js';
import { conflict, notFound } from '../../util/errors.js';

interface EnvironmentRow {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  variables: string;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
}

function map(row: EnvironmentRow): Environment {
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    name: row.name,
    variables: readJson<Record<string, string>>(row.variables, {}),
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listEnvironments(projectId: string): Promise<Environment[]> {
  const rows = await getDb()<EnvironmentRow>('environments')
    .where({ project_id: projectId })
    .orderBy('sort_order', 'asc');
  return rows.map(map);
}

export async function getEnvironmentById(id: string): Promise<Environment | null> {
  const row = await getDb()<EnvironmentRow>('environments').where({ id }).first();
  return row ? map(row) : null;
}

export async function getEnvironmentBySlugOrId(
  projectId: string,
  key: string
): Promise<Environment | null> {
  const db = getDb();
  const row = await db<EnvironmentRow>('environments')
    .where({ project_id: projectId, slug: key })
    .first();
  if (row) return map(row);
  const byId = await db<EnvironmentRow>('environments')
    .where({ project_id: projectId, id: key })
    .first();
  return byId ? map(byId) : null;
}

export async function createEnvironment(
  projectId: string,
  input: EnvironmentCreateInput
): Promise<Environment> {
  const db = getDb();
  const dup = await db('environments')
    .where({ project_id: projectId, slug: input.slug })
    .first();
  if (dup) throw conflict('slug_taken', `环境 slug "${input.slug}" 已存在`);
  const id = newId();
  const ts = now();
  await db('environments').insert({
    id,
    project_id: projectId,
    slug: input.slug,
    name: input.name,
    variables: writeJson(input.variables ?? {}),
    sort_order: input.sortOrder ?? 0,
    created_at: ts,
    updated_at: ts,
  });
  return (await getEnvironmentById(id))!;
}

export async function updateEnvironment(
  id: string,
  input: EnvironmentUpdateInput
): Promise<Environment> {
  const db = getDb();
  const existing = await getEnvironmentById(id);
  if (!existing) throw notFound('environment_not_found', '环境不存在');
  if (input.slug && input.slug !== existing.slug) {
    const dup = await db('environments')
      .where({ project_id: existing.projectId, slug: input.slug })
      .first();
    if (dup) throw conflict('slug_taken', `环境 slug "${input.slug}" 已存在`);
  }
  await db('environments')
    .where({ id })
    .update({
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.variables !== undefined ? { variables: writeJson(input.variables) } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      updated_at: now(),
    });
  return (await getEnvironmentById(id))!;
}

export async function deleteEnvironment(id: string): Promise<void> {
  const existing = await getEnvironmentById(id);
  if (!existing) throw notFound('environment_not_found', '环境不存在');
  await getDb()('environments').where({ id }).delete();
}
