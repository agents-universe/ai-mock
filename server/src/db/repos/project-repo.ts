import type {
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
} from '@ai-mock/shared';
import { getDb } from '../connection.js';
import { newId, now } from './helpers.js';
import { conflict, notFound } from '../../util/errors.js';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function map(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await getDb()<ProjectRow>('projects').orderBy('created_at', 'asc');
  return rows.map(map);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const row = await getDb()<ProjectRow>('projects').where({ id }).first();
  return row ? map(row) : null;
}

export async function getProjectBySlugOrId(key: string): Promise<Project | null> {
  const db = getDb();
  const row = await db<ProjectRow>('projects').where({ slug: key }).first();
  if (row) return map(row);
  const byId = await db<ProjectRow>('projects').where({ id: key }).first();
  return byId ? map(byId) : null;
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const db = getDb();
  const dup = await db('projects').where({ slug: input.slug }).first();
  if (dup) throw conflict('slug_taken', `slug "${input.slug}" 已存在`);
  const id = newId();
  const ts = now();
  await db('projects').insert({
    id,
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    created_at: ts,
    updated_at: ts,
  });
  return (await getProjectById(id))!;
}

export async function updateProject(
  id: string,
  input: ProjectUpdateInput
): Promise<Project> {
  const db = getDb();
  const existing = await getProjectById(id);
  if (!existing) throw notFound('project_not_found', '项目不存在');
  if (input.slug && input.slug !== existing.slug) {
    const dup = await db('projects').where({ slug: input.slug }).first();
    if (dup) throw conflict('slug_taken', `slug "${input.slug}" 已存在`);
  }
  await db('projects')
    .where({ id })
    .update({
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updated_at: now(),
    });
  return (await getProjectById(id))!;
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  const existing = await getProjectById(id);
  if (!existing) throw notFound('project_not_found', '项目不存在');
  await db('projects').where({ id }).delete();
}

export async function countApisByProject(projectId: string): Promise<number> {
  const row = await getDb()
    .from('apis')
    .where({ project_id: projectId })
    .count('* as c')
    .first();
  return Number((row as { c?: number | string } | undefined)?.c ?? 0);
}

export async function countEnvsByProject(projectId: string): Promise<number> {
  const row = await getDb()
    .from('environments')
    .where({ project_id: projectId })
    .count('* as c')
    .first();
  return Number((row as { c?: number | string } | undefined)?.c ?? 0);
}
