import { getDb } from '../connection.js';
import { newId, now, readJson } from './helpers.js';
import type { MockOutcome } from '../../mock/pipeline.js';

export interface MockLog {
  id: string;
  projectId: string | null;
  environmentId: string | null;
  apiId: string | null;
  branchId: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  matched: boolean;
  reason: string;
  createdAt: string;
}

/**
 * Serialize a snapshot while keeping the stored JSON *valid*.
 * Slicing the serialized text (the old approach) always produced broken
 * JSON, so readJson fell back to null and the snapshot was lost entirely.
 */
function snapshotJson(payload: { body: unknown; headers?: Record<string, string> }, max = 4096): string {
  const { body } = payload;
  if (body !== undefined && body !== null) {
    const bodyJson = JSON.stringify(body) ?? '';
    if (bodyJson.length > max - 128) {
      // replace the body value with a truncated *string* — wrapper stays valid
      return JSON.stringify({
        ...payload,
        body: bodyJson.slice(0, max - 128) + '…[truncated]',
      });
    }
  }
  return JSON.stringify(payload);
}

export async function insertLog(entry: {
  projectId: string | null;
  environmentId: string | null;
  method: string;
  path: string;
  outcome: MockOutcome;
  requestBody: unknown;
}): Promise<void> {
  const { outcome } = entry;
  try {
    await getDb()('mock_logs').insert({
      id: newId(),
      project_id: entry.projectId,
      environment_id: entry.environmentId,
      api_id: outcome.api?.id ?? null,
      branch_id: outcome.branch?.id ?? null,
      method: entry.method,
      path: entry.path,
      status_code: outcome.status,
      duration_ms: outcome.durationMs,
      matched: outcome.reason === 'matched',
      reason: outcome.reason,
      request_snapshot: snapshotJson({ body: entry.requestBody }),
      response_snapshot: snapshotJson({ body: outcome.body, headers: outcome.headers }),
      created_at: now(),
    });
  } catch {
    // logging must never break mock serving
  }
}

export interface LogQuery {
  limit?: number;
  method?: string;
  path?: string;
  matched?: boolean;
  status?: number;
  branchId?: string;
  apiId?: string;
  environmentId?: string;
  /** ISO datetime lower bound (inclusive) on created_at */
  from?: string;
  /** ISO datetime upper bound (inclusive) on created_at */
  to?: string;
}

export async function listLogs(
  projectId: string,
  opts: LogQuery = {}
): Promise<MockLog[]> {
  let q = getDb()('mock_logs').where({ project_id: projectId });
  if (opts.method !== undefined) q = q.where({ method: opts.method });
  if (opts.path !== undefined) q = q.where({ path: opts.path });
  if (opts.matched !== undefined) q = q.where({ matched: opts.matched });
  if (opts.status !== undefined) q = q.where({ status_code: opts.status });
  if (opts.branchId !== undefined) q = q.where({ branch_id: opts.branchId });
  if (opts.apiId !== undefined) q = q.where({ api_id: opts.apiId });
  if (opts.environmentId !== undefined) q = q.where({ environment_id: opts.environmentId });
  if (opts.from !== undefined) q = q.where('created_at', '>=', opts.from);
  if (opts.to !== undefined) q = q.where('created_at', '<=', opts.to);
  const rows = await q
    .orderBy('created_at', 'desc')
    .limit(Math.min(opts.limit ?? 200, 1000));
  return rows.map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    environmentId: r.environment_id,
    apiId: r.api_id,
    branchId: r.branch_id,
    method: r.method,
    path: r.path,
    statusCode: r.status_code,
    durationMs: r.duration_ms,
    matched: Boolean(r.matched),
    reason: r.reason,
    createdAt: new Date(r.created_at).toISOString(),
    requestSnapshot: readJson(r.request_snapshot, null),
    responseSnapshot: readJson(r.response_snapshot, null),
  })) as MockLog[];
}
