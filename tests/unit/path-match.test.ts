import { describe, expect, it } from 'vitest';
import type { MockApi } from '@ai-mock/shared';
import { compileApiPaths, matchApi } from '../../server/src/mock/path-match.js';

function api(partial: Partial<MockApi>): MockApi {
  return {
    id: 'id',
    projectId: 'p',
    name: 'api',
    method: 'GET',
    path: '/',
    description: null,
    enabled: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('path-match', () => {
  it('matches path params', () => {
    const matchers = compileApiPaths([api({ id: 'a1', path: '/api/users/:id' })]);
    const m = matchApi(matchers, 'GET', '/api/users/42');
    expect(m?.api.id).toBe('a1');
    expect(m?.params).toEqual({ id: '42' });
  });

  it('matches wildcards', () => {
    const matchers = compileApiPaths([api({ path: '/files/*' })]);
    expect(matchApi(matchers, 'GET', '/files/a/b.txt')).not.toBeNull();
    expect(matchApi(matchers, 'GET', '/other')).toBeNull();
  });

  it('filters by method', () => {
    const matchers = compileApiPaths([api({ method: 'POST', path: '/api/x' })]);
    expect(matchApi(matchers, 'GET', '/api/x')).toBeNull();
    expect(matchApi(matchers, 'POST', '/api/x')).not.toBeNull();
  });

  it('prefers more specific paths', () => {
    const matchers = compileApiPaths([
      api({ id: 'gen', path: '/api/users/:id', sortOrder: 0 }),
      api({ id: 'me', path: '/api/users/me', sortOrder: 0 }),
    ]);
    expect(matchApi(matchers, 'GET', '/api/users/me')?.api.id).toBe('me');
    expect(matchApi(matchers, 'GET', '/api/users/9')?.api.id).toBe('gen');
  });

  it('respects sort_order over specificity', () => {
    const matchers = compileApiPaths([
      api({ id: 'first', path: '/api/users/:id', sortOrder: 0 }),
      api({ id: 'second', path: '/api/users/me', sortOrder: 1 }),
    ]);
    // 'first' comes first by sort_order even though less specific
    expect(matchApi(matchers, 'GET', '/api/users/me')?.api.id).toBe('first');
  });

  it('skips disabled APIs', () => {
    const matchers = compileApiPaths([api({ path: '/api/x', enabled: false })]);
    expect(matchApi(matchers, 'GET', '/api/x')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const matchers = compileApiPaths([api({ path: '/api/x' })]);
    expect(matchApi(matchers, 'GET', '/api/y')).toBeNull();
  });
});
