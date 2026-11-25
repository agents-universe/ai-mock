import type { MockApi, RequestContext, ResponseBranch } from '@ai-mock/shared';
import { MAX_DELAY_MS, SCRIPT_TIMEOUT_MS } from '@ai-mock/shared';
import {
  getProjectConfig,
  getEnvironmentFromConfig,
  matchApiFromConfig,
} from '../db/cache.js';
import { evaluateBranch } from '../conditions/evaluate-branch.js';
import { runScript, ScriptError } from '../script/sandbox.js';
import { sleep } from '../util/sleep.js';

export type MockReason =
  | 'matched'
  | 'project_not_found'
  | 'environment_not_found'
  | 'no_api'
  | 'no_branch'
  | 'script_error';

export interface MockInput {
  projectKey: string;
  envKey: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockOutcome {
  reason: MockReason;
  status: number;
  headers: Record<string, string>;
  body: string;
  delayMs: number;
  warnings: string[];
  api?: MockApi;
  branch?: ResponseBranch;
  errorMessage?: string;
  durationMs: number;
}

function errorOutcome(
  reason: MockReason,
  status: number,
  error: string,
  message: string,
  startedAt: number
): MockOutcome {
  return {
    reason,
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error, message }),
    delayMs: 0,
    warnings: [],
    errorMessage: message,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Resolve a mock request end-to-end without sleeping or logging.
 * Used by both the real /mock handler and the UI preview endpoint.
 */
export async function resolveMock(input: MockInput): Promise<MockOutcome> {
  const startedAt = Date.now();

  const config = await getProjectConfig(input.projectKey);
  if (!config) {
    return errorOutcome('project_not_found', 404, 'project_not_found', '项目不存在', startedAt);
  }
  const env = getEnvironmentFromConfig(config, input.envKey);
  if (!env) {
    return errorOutcome(
      'environment_not_found',
      404,
      'environment_not_found',
      '环境不存在',
      startedAt
    );
  }

  const matchedApi = matchApiFromConfig(config, input.method, input.path);
  if (!matchedApi) {
    return errorOutcome(
      'no_api',
      404,
      'no_mock_matched',
      `没有匹配的 Mock: ${input.method} ${input.path}`,
      startedAt
    );
  }

  const ctx: RequestContext = {
    method: input.method.toUpperCase(),
    path: input.path,
    params: matchedApi.params,
    query: input.query,
    headers: input.headers,
    body: input.body,
    env: env.variables,
  };

  const branches = config.branchesByApi.get(matchedApi.api.id) ?? [];
  const warnings: string[] = [];
  let selected: ResponseBranch | undefined;

  for (const branch of branches) {
    if (branch.isDefault) continue; // default evaluated after the ordered pass
    const result = await evaluateBranch(branch, ctx);
    if (result.warning) warnings.push(result.warning);
    if (result.matched) {
      selected = branch;
      break;
    }
  }

  if (!selected) {
    selected = branches.find((b) => b.isDefault && b.enabled);
  }

  if (!selected) {
    return {
      ...errorOutcome(
        'no_branch',
        500,
        'no_branch_matched',
        `API ${matchedApi.api.method} ${matchedApi.api.path} 没有可用的响应分支`,
        startedAt
      ),
      api: matchedApi.api,
    };
  }

  // delay (branch config + script delay effect applied after body production)
  const baseDelay = Math.min(Math.max(0, selected.delayMs), MAX_DELAY_MS);

  // produce body
  let body: string;
  let status = selected.statusCode;
  const headers: Record<string, string> = { ...selected.headers };
  let scriptDelay = 0;

  if (selected.bodyType === 'script') {
    try {
      const result = await runScript(selected.script ?? '', ctx, env.variables, {
        timeoutMs: SCRIPT_TIMEOUT_MS,
      });
      const value = result.body;
      if (value === undefined || value === null) {
        body = '';
      } else if (typeof value === 'string') {
        body = value;
      } else if (Buffer.isBuffer(value)) {
        body = value.toString('utf8');
      } else {
        body = JSON.stringify(value);
      }
      // re-validate effects at the exit: scripts can bypass setStatus/
      // setHeader by writing `__effects` directly
      if (result.effects.status !== undefined) {
        if (!Number.isInteger(result.effects.status) || result.effects.status < 100 || result.effects.status > 599) {
          return {
            ...errorOutcome(
              'script_error',
              500,
              'script_error',
              `脚本设置了非法状态码: ${String(result.effects.status)}`,
              startedAt
            ),
            api: matchedApi.api,
            branch: selected,
            warnings,
          };
        }
        status = result.effects.status;
      }
      for (const [hk, hv] of Object.entries(result.effects.headers)) {
        if (
          !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(hk) ||
          /[^\t\x20-\x7e\x80-\xff]/.test(hv)
        ) {
          return {
            ...errorOutcome(
              'script_error',
              500,
              'script_error',
              `脚本设置了非法响应头: ${JSON.stringify(hk)}`,
              startedAt
            ),
            api: matchedApi.api,
            branch: selected,
            warnings,
          };
        }
        headers[hk] = hv;
      }
      scriptDelay = Math.min(result.effects.delayMs ?? 0, MAX_DELAY_MS);
    } catch (err) {
      const message = err instanceof ScriptError || err instanceof Error ? err.message : String(err);
      return {
        ...errorOutcome('script_error', 500, 'script_error', message, startedAt),
        api: matchedApi.api,
        branch: selected,
        warnings,
      };
    }
  } else {
    body = selected.staticBody ?? '';
  }

  // script-set content-type wins; only fall back to the branch default when
  // nobody set it (case-insensitive — setHeader('Content-Type', …) used to
  // be silently overwritten here)
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (!hasContentType) headers['content-type'] = selected.contentType;
  headers['x-ai-mock-api'] = matchedApi.api.id;
  headers['x-ai-mock-branch'] = selected.id;
  headers['x-ai-mock-branch-name'] = encodeURIComponent(selected.name);
  if (warnings.length > 0) {
    // truncate by code points BEFORE encoding: slicing a UTF-16 string can
    // split a surrogate pair, and encodeURIComponent then throws URIError
    // (which would take down the whole mock response over a debug header)
    try {
      const raw = Array.from(warnings.join('; ')).slice(0, 512).join('');
      headers['x-ai-mock-warning'] = encodeURIComponent(raw);
    } catch {
      /* warning header is best-effort */
    }
  }

  return {
    reason: 'matched',
    status,
    headers,
    body,
    delayMs: Math.min(baseDelay + scriptDelay, MAX_DELAY_MS),
    warnings,
    api: matchedApi.api,
    branch: selected,
    durationMs: Date.now() - startedAt,
  };
}

/** Apply delay and send the outcome on a real request. */
export async function applyOutcome(outcome: MockOutcome): Promise<void> {
  if (outcome.delayMs > 0) await sleep(outcome.delayMs);
}
