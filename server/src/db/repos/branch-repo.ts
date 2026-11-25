import type { ResponseBranch, ResponseBranchCreateInput, ResponseBranchUpdateInput } from '@ai-mock/shared';
import { getDb } from '../connection.js';
import { newId, now, readJson, writeJson } from './helpers.js';
import { badRequest, notFound } from '../../util/errors.js';

interface BranchRow {
  id: string;
  api_id: string;
  name: string;
  sort_order: number;
  enabled: number | boolean;
  condition_type: string;
  condition_rules: string | null;
  condition_expression: string | null;
  is_default: number | boolean;
  status_code: number;
  headers: string;
  delay_ms: number;
  content_type: string;
  body_type: string;
  static_body: string | null;
  script: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function map(row: BranchRow): ResponseBranch {
  return {
    id: row.id,
    apiId: row.api_id,
    name: row.name,
    sortOrder: row.sort_order,
    enabled: Boolean(row.enabled),
    conditionType: row.condition_type as ResponseBranch['conditionType'],
    conditionRules: row.condition_rules
      ? readJson<ResponseBranch['conditionRules']>(row.condition_rules, null)
      : null,
    conditionExpression: row.condition_expression,
    isDefault: Boolean(row.is_default),
    statusCode: row.status_code,
    headers: readJson<Record<string, string>>(row.headers, {}),
    delayMs: row.delay_ms,
    contentType: row.content_type,
    bodyType: row.body_type as ResponseBranch['bodyType'],
    staticBody: row.static_body,
    script: row.script,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listBranches(apiId: string): Promise<ResponseBranch[]> {
  const rows = await getDb()<BranchRow>('response_branches')
    .where({ api_id: apiId })
    .orderBy([
      { column: 'is_default', order: 'desc' }, // default always last in evaluation: handled in pipeline
      { column: 'sort_order', order: 'asc' },
    ]);
  return rows.map(map);
}

/** Evaluation order: non-default branches by sort_order, then the default branch. */
export async function listBranchesForEvaluation(apiId: string): Promise<ResponseBranch[]> {
  const rows = await getDb()<BranchRow>('response_branches')
    .where({ api_id: apiId })
    .orderBy([
      { column: 'is_default', order: 'asc' },
      { column: 'sort_order', order: 'asc' },
    ]);
  return rows.map(map);
}

export async function getBranchById(id: string): Promise<ResponseBranch | null> {
  const row = await getDb()<BranchRow>('response_branches').where({ id }).first();
  return row ? map(row) : null;
}

async function assertSingleDefault(
  apiId: string,
  isDefault: boolean,
  excludeId?: string
): Promise<void> {
  if (!isDefault) return;
  const db = getDb();
  let q = db('response_branches').where({ api_id: apiId, is_default: true });
  if (excludeId) q = q.whereNot({ id: excludeId });
  const existing = await q.first();
  if (existing) {
    throw badRequest('duplicate_default', '每个 API 只能有一个默认分支');
  }
}

export async function createBranch(
  apiId: string,
  input: ResponseBranchCreateInput
): Promise<ResponseBranch> {
  const db = getDb();
  await assertSingleDefault(apiId, input.isDefault ?? false);
  const maxSort = await db('response_branches')
    .where({ api_id: apiId })
    .max<{ m: number | null }>('sort_order as m')
    .first();
  const id = newId();
  const ts = now();
  await db('response_branches').insert({
    id,
    api_id: apiId,
    name: input.name,
    sort_order: Number(maxSort?.m ?? -1) + 1,
    enabled: input.enabled ?? true,
    condition_type: input.conditionType ?? 'always',
    condition_rules: input.conditionRules ? writeJson(input.conditionRules) : null,
    condition_expression: input.conditionExpression ?? null,
    is_default: input.isDefault ?? false,
    status_code: input.statusCode ?? 200,
    headers: writeJson(input.headers ?? {}),
    delay_ms: input.delayMs ?? 0,
    content_type: input.contentType ?? 'application/json',
    body_type: input.bodyType ?? 'static',
    static_body: input.staticBody ?? null,
    script: input.script ?? null,
    created_at: ts,
    updated_at: ts,
  });
  return (await getBranchById(id))!;
}

export async function updateBranch(
  id: string,
  input: ResponseBranchUpdateInput
): Promise<ResponseBranch> {
  const db = getDb();
  const existing = await getBranchById(id);
  if (!existing) throw notFound('branch_not_found', '响应分支不存在');
  if (input.isDefault !== undefined) {
    await assertSingleDefault(existing.apiId, input.isDefault, id);
  }
  await db('response_branches')
    .where({ id })
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.conditionType !== undefined ? { condition_type: input.conditionType } : {}),
      ...(input.conditionRules !== undefined
        ? { condition_rules: input.conditionRules ? writeJson(input.conditionRules) : null }
        : {}),
      ...(input.conditionExpression !== undefined
        ? { condition_expression: input.conditionExpression }
        : {}),
      ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
      ...(input.statusCode !== undefined ? { status_code: input.statusCode } : {}),
      ...(input.headers !== undefined ? { headers: writeJson(input.headers) } : {}),
      ...(input.delayMs !== undefined ? { delay_ms: input.delayMs } : {}),
      ...(input.contentType !== undefined ? { content_type: input.contentType } : {}),
      ...(input.bodyType !== undefined ? { body_type: input.bodyType } : {}),
      ...(input.staticBody !== undefined ? { static_body: input.staticBody } : {}),
      ...(input.script !== undefined ? { script: input.script } : {}),
      updated_at: now(),
    });
  return (await getBranchById(id))!;
}

export async function deleteBranch(id: string): Promise<void> {
  const existing = await getBranchById(id);
  if (!existing) throw notFound('branch_not_found', '响应分支不存在');
  await getDb()('response_branches').where({ id }).delete();
}

export async function reorderBranches(apiId: string, ids: string[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (trx) => {
    for (let i = 0; i < ids.length; i++) {
      await trx('response_branches')
        .where({ id: ids[i], api_id: apiId })
        .update({ sort_order: i, updated_at: now() });
    }
  });
}
