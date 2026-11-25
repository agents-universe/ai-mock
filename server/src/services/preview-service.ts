import type { PreviewRequestBody } from '@ai-mock/shared';
import { resolveMock } from '../mock/pipeline.js';
import { getApiById } from '../db/repos/api-repo.js';
import { listEnvironments } from '../db/repos/environment-repo.js';
import { notFound } from '../util/errors.js';

function safeDecodePath(p: string): string {
  if (!p.includes('%')) return p;
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Dry-run the mock match pipeline for one API — shared by REST preview and MCP simulate_request. */
export async function runPreview(body: PreviewRequestBody) {
  const api = await getApiById(body.apiId);
  if (!api) throw notFound('api_not_found', 'API 不存在');

  // Preview uses envId when provided, else the first environment of the project.
  const envs = await listEnvironments(api.projectId);
  const envKey =
    body.envId && envs.some((e) => e.id === body.envId)
      ? body.envId
      : (envs[0]?.id ?? '');

  const outcome = await resolveMock({
    projectKey: api.projectId,
    envKey,
    method: body.request.method,
    // decode once so preview matches the real /mock URL semantics
    // (find-my-way already decodes params there); invalid sequences stay
    // as-is instead of throwing
    path: safeDecodePath(body.request.path),
    query: body.request.query ?? {},
    headers: body.request.headers ?? {},
    body: body.request.body,
  });

  return {
    matched: outcome.reason === 'matched',
    reason: outcome.reason,
    apiId: outcome.api?.id ?? null,
    branch: outcome.branch
      ? {
          id: outcome.branch.id,
          name: outcome.branch.name,
          conditionType: outcome.branch.conditionType,
          isDefault: outcome.branch.isDefault,
        }
      : null,
    status: outcome.status,
    headers: outcome.headers,
    body: outcome.body,
    warnings: outcome.warnings,
    delayMs: outcome.delayMs,
    durationMs: outcome.durationMs,
    errorMessage: outcome.errorMessage ?? null,
    environments: envs.map((e) => ({ id: e.id, slug: e.slug, name: e.name })),
    selectedEnv: envKey,
  };
}
