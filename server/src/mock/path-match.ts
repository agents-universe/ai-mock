import { match, type MatchFunction, type ParamData } from 'path-to-regexp';
import type { MockApi } from '@ai-mock/shared';

export interface CompiledMatcher {
  api: MockApi;
  matcher: MatchFunction<ParamData>;
}

/**
 * path-to-regexp v8 requires named wildcards. Users write `/files/*`,
 * we translate bare `*` segments to a named wildcard.
 */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => (seg === '*' ? '*__wild' : seg))
    .join('/');
}

/** True when the path compiles under path-to-regexp (used to reject bad input). */
export function isCompilablePath(path: string): boolean {
  try {
    match(normalizePath(path), { decode: (v) => v, end: true });
    return true;
  } catch {
    return false;
  }
}

function segmentInfo(path: string): { total: number; staticCount: number } {
  const segs = path.split('/').filter(Boolean);
  return {
    total: segs.length,
    staticCount: segs.filter((s) => !s.startsWith(':') && !s.startsWith('*')).length,
  };
}

/**
 * Compile enabled APIs into matchers. Evaluation order: sort_order asc,
 * then higher specificity (more static segments, then more segments) first.
 */
export function compileApiPaths(apis: MockApi[]): CompiledMatcher[] {
  const sorted = [...apis]
    .filter((a) => a.enabled)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const sa = segmentInfo(a.path);
      const sb = segmentInfo(b.path);
      if (sa.staticCount !== sb.staticCount) return sb.staticCount - sa.staticCount;
      return sb.total - sa.total;
    });
  const out: CompiledMatcher[] = [];
  for (const api of sorted) {
    try {
      out.push({
        api,
        // params arrive already URL-decoded (find-my-way decodes, preview
        // paths are user-typed) — decoding again corrupts values containing
        // a literal '%' (decodeURIComponent throws URIError → 500)
        matcher: match(normalizePath(api.path), { decode: (v) => v, end: true }),
      });
    } catch {
      // one bad legacy path must not break matching for the whole project
      console.warn(`[ai-mock] skip uncompilable api path: ${api.method} ${api.path}`);
    }
  }
  return out;
}

export function matchApi(
  matchers: CompiledMatcher[],
  method: string,
  path: string
): { api: MockApi; params: Record<string, string> } | null {
  const upperMethod = method.toUpperCase();
  for (const m of matchers) {
    if (m.api.method !== upperMethod) continue;
    const result = m.matcher(path);
    if (result) {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(result.params)) {
        if (v !== undefined) params[k] = Array.isArray(v) ? v.join('/') : String(v);
      }
      return { api: m.api, params };
    }
  }
  return null;
}
