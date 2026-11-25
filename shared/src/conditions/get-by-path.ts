const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Safe dot-path getter. Blocks prototype-pollution vectors.
 * Supports array indices: "items.0.qty".
 */
export function getByPath(source: unknown, path: string): unknown {
  if (source == null) return undefined;
  if (path === '') return source;
  let current: unknown = source;
  for (const seg of path.split('.')) {
    if (seg === '') continue;
    if (FORBIDDEN.has(seg)) return undefined;
    if (current == null) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}
