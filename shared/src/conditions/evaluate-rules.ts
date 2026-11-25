import { getByPath } from './get-by-path.js';
import type { ConditionRule, RequestContext, RuleLeaf } from './types.js';

export interface RuleEvalResult {
  matched: boolean;
  warning?: string;
}

export interface RuleEvalOptions {
  /**
   * Custom regex tester for the `matches` op. The server passes a
   * vm-isolated implementation with a hard timeout so catastrophic
   * backtracking can't freeze the event loop; the default runs RegExp
   * directly (fine for tests / trusted input).
   */
  testRegex?: (pattern: string, input: string) => RuleEvalResult;
}

function defaultTestRegex(pattern: string, input: string): RuleEvalResult {
  try {
    return { matched: new RegExp(pattern).test(input) };
  } catch {
    return { matched: false, warning: `invalid regex: ${pattern}` };
  }
}

function sourceValue(leaf: RuleLeaf, ctx: RequestContext): unknown {
  return unwrapSingleton(normalizeSource(leaf, ctx));
}

/**
 * Fastify produces arrays for duplicate query/form keys (`?a=1&a=2`), which
 * made eq/ne/in silently fail (JSON.stringify(["x"]) !== "x"). A
 * single-element array is treated as the scalar it stands for; multi-element
 * arrays keep their list semantics (contains/in handle those).
 */
function unwrapSingleton(v: unknown): unknown {
  return Array.isArray(v) && v.length === 1 ? v[0] : v;
}

function normalizeSource(leaf: RuleLeaf, ctx: RequestContext): unknown {
  switch (leaf.source) {
    case 'query':
      return getByPath(ctx.query, leaf.field);
    case 'header':
      // header names are case-insensitive: normalize both the stored keys and
      // the configured field so `Authorization` matches `authorization` and
      // vice versa, regardless of how the request context was built.
      return getByPath(
        lowerKeys(ctx.headers ?? {}) as Record<string, unknown>,
        String(leaf.field).toLowerCase()
      );
    case 'body':
      return getByPath(ctx.body, leaf.field);
    case 'params':
      return getByPath(ctx.params, leaf.field);
    case 'method':
      return ctx.method;
    case 'env':
      return getByPath(ctx.env, leaf.field);
    default:
      return undefined;
  }
}

function lowerKeys(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function compareOrder(op: 'gt' | 'gte' | 'lt' | 'lte', actual: unknown, expected: unknown): boolean {
  const a = toNumber(actual);
  const b = toNumber(expected);
  if (a === null || b === null) return false;
  switch (op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

function evaluateLeaf(
  leaf: RuleLeaf,
  ctx: RequestContext,
  warnings: string[],
  opts: RuleEvalOptions
): boolean {
  const actual = sourceValue(leaf, ctx);
  const expected = leaf.value;
  const exists = actual !== undefined && actual !== null;

  switch (leaf.op) {
    case 'exists':
      return exists;
    case 'not_exists':
      return !exists;
    case 'eq':
      return exists && looseEq(actual, expected);
    case 'ne':
      return !looseEq(actual, expected);
    case 'contains': {
      if (!exists) return false;
      if (Array.isArray(actual)) return actual.some((v) => looseEq(v, expected));
      return String(actual).includes(String(expected));
    }
    case 'not_contains': {
      if (!exists) return true;
      if (Array.isArray(actual)) return !actual.some((v) => looseEq(v, expected));
      return !String(actual).includes(String(expected));
    }
    case 'starts_with':
      return exists && String(actual).startsWith(String(expected));
    case 'ends_with':
      return exists && String(actual).endsWith(String(expected));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return exists && compareOrder(leaf.op, actual, expected);
    case 'in': {
      if (!exists) return false;
      // accept arrays, csv strings, and legacy stored numbers (200 → ['200'])
      const list = Array.isArray(expected)
        ? expected
        : expected === null || expected === undefined
          ? []
          : String(expected).split(',').map((s) => s.trim());
      return list.some((v) => looseEq(actual, v));
    }
    case 'matches': {
      if (!exists) return false;
      const testRegex = opts.testRegex ?? defaultTestRegex;
      const result = testRegex(String(expected), String(actual));
      if (result.warning) warnings.push(result.warning);
      return result.matched;
    }
    default:
      return false;
  }
}

/**
 * Pure structured-rule evaluator. Shared by the server mock pipeline and the UI preview.
 */
export function evaluateRules(
  rule: ConditionRule,
  ctx: RequestContext,
  opts: RuleEvalOptions = {}
): RuleEvalResult {
  const warnings: string[] = [];
  const matched = evalNode(rule, ctx, warnings, opts);
  return warnings.length > 0 ? { matched, warning: warnings.join('; ') } : { matched };
}

function evalNode(
  node: ConditionRule,
  ctx: RequestContext,
  warnings: string[],
  opts: RuleEvalOptions
): boolean {
  if (node.type === 'rule') return evaluateLeaf(node, ctx, warnings, opts);
  let out: boolean;
  if (!Array.isArray(node.children) || node.children.length === 0) {
    // empty group: AND → true, OR → false (no conditions)
    out = node.combinator === 'and';
  } else {
    const results = node.children.map((c) => evalNode(c, ctx, warnings, opts));
    out = node.combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  // `not` must apply to every group, including empty ones
  if (node.not) out = !out;
  return out;
}
