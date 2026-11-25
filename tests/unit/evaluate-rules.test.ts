import { describe, expect, it } from 'vitest';
import { evaluateRules, type ConditionRule, type RequestContext } from '@ai-mock/shared';

function ctx(partial: Partial<RequestContext> = {}): RequestContext {
  return {
    method: 'GET',
    path: '/api/users/1',
    params: { id: '1' },
    query: {},
    headers: {},
    body: undefined,
    env: {},
    ...partial,
  };
}

describe('evaluateRules', () => {
  it('eq on query', () => {
    const rule: ConditionRule = {
      type: 'rule',
      source: 'query',
      field: 'status',
      op: 'eq',
      value: 'active',
    };
    expect(evaluateRules(rule, ctx({ query: { status: 'active' } })).matched).toBe(true);
    expect(evaluateRules(rule, ctx({ query: { status: 'off' } })).matched).toBe(false);
    expect(evaluateRules(rule, ctx()).matched).toBe(false);
  });

  it('numeric comparisons', () => {
    const rule: ConditionRule = {
      type: 'rule',
      source: 'body',
      field: 'amount',
      op: 'gt',
      value: 100,
    };
    expect(evaluateRules(rule, ctx({ body: { amount: 101 } })).matched).toBe(true);
    expect(evaluateRules(rule, ctx({ body: { amount: 100 } })).matched).toBe(false);
    expect(evaluateRules(rule, ctx({ body: { amount: '200' } })).matched).toBe(true);
  });

  it('header lookup is case-insensitive', () => {
    const rule: ConditionRule = {
      type: 'rule',
      source: 'header',
      field: 'x-api-key',
      op: 'eq',
      value: 'k1',
    };
    expect(evaluateRules(rule, ctx({ headers: { 'X-API-Key': 'k1' } })).matched).toBe(true);
    // both directions: configured field in mixed case, request key lowercased
    // (the server normalizes all header keys to lowercase)
    const rule2: ConditionRule = {
      type: 'rule',
      source: 'header',
      field: 'Authorization',
      op: 'eq',
      value: 'Bearer t',
    };
    expect(
      evaluateRules(rule2, ctx({ headers: { authorization: 'Bearer t' } })).matched
    ).toBe(true);
    const existsRule: ConditionRule = {
      type: 'rule',
      source: 'header',
      field: 'X-Api-Key',
      op: 'exists',
    };
    expect(evaluateRules(existsRule, ctx({ headers: { 'x-api-key': '1' } })).matched).toBe(true);
  });

  it('nested body path', () => {
    const rule: ConditionRule = {
      type: 'rule',
      source: 'body',
      field: 'user.id',
      op: 'eq',
      value: 7,
    };
    expect(evaluateRules(rule, ctx({ body: { user: { id: 7 } } })).matched).toBe(true);
  });

  it('and/or groups', () => {
    const rule: ConditionRule = {
      type: 'group',
      combinator: 'and',
      children: [
        { type: 'rule', source: 'query', field: 'a', op: 'eq', value: '1' },
        {
          type: 'group',
          combinator: 'or',
          children: [
            { type: 'rule', source: 'query', field: 'b', op: 'eq', value: '2' },
            { type: 'rule', source: 'query', field: 'c', op: 'eq', value: '3' },
          ],
        },
      ],
    };
    expect(evaluateRules(rule, ctx({ query: { a: '1', b: '2' } })).matched).toBe(true);
    expect(evaluateRules(rule, ctx({ query: { a: '1', c: '3' } })).matched).toBe(true);
    expect(evaluateRules(rule, ctx({ query: { a: '1', b: 'x', c: 'y' } })).matched).toBe(false);
    expect(evaluateRules(rule, ctx({ query: { b: '2' } })).matched).toBe(false);
  });

  it('exists / not_exists', () => {
    const exists: ConditionRule = { type: 'rule', source: 'query', field: 'q', op: 'exists' };
    const notExists: ConditionRule = { type: 'rule', source: 'query', field: 'q', op: 'not_exists' };
    expect(evaluateRules(exists, ctx({ query: { q: '' } })).matched).toBe(true);
    expect(evaluateRules(exists, ctx()).matched).toBe(false);
    expect(evaluateRules(notExists, ctx()).matched).toBe(true);
  });

  it('in with array and csv', () => {
    const rule: ConditionRule = { type: 'rule', source: 'query', field: 's', op: 'in', value: ['a', 'b'] };
    expect(evaluateRules(rule, ctx({ query: { s: 'b' } })).matched).toBe(true);
    const csv: ConditionRule = { type: 'rule', source: 'query', field: 's', op: 'in', value: 'a, b' };
    expect(evaluateRules(csv, ctx({ query: { s: 'b' } })).matched).toBe(true);
    // legacy stored number must not collapse to an empty list
    const num: ConditionRule = { type: 'rule', source: 'query', field: 's', op: 'in', value: 200 };
    expect(evaluateRules(num, ctx({ query: { s: '200' } })).matched).toBe(true);
  });

  it('eq keeps leading zeros / exact string form', () => {
    const rule: ConditionRule = { type: 'rule', source: 'query', field: 'v', op: 'eq', value: '007' };
    expect(evaluateRules(rule, ctx({ query: { v: '007' } })).matched).toBe(true);
    expect(evaluateRules(rule, ctx({ query: { v: '7' } })).matched).toBe(false);
  });

  it('single-element arrays (duplicate query keys) compare as scalars', () => {
    // Fastify yields ['active'] for ?status=active&status=active — eq/ne/in
    // used to fail silently against the array while contains worked
    const eq: ConditionRule = { type: 'rule', source: 'query', field: 'status', op: 'eq', value: 'active' };
    expect(evaluateRules(eq, ctx({ query: { status: ['active'] } })).matched).toBe(true);
    const ne: ConditionRule = { type: 'rule', source: 'query', field: 'status', op: 'ne', value: 'active' };
    expect(evaluateRules(ne, ctx({ query: { status: ['active'] } })).matched).toBe(false);
    const inOp: ConditionRule = { type: 'rule', source: 'query', field: 'status', op: 'in', value: 'active,off' };
    expect(evaluateRules(inOp, ctx({ query: { status: ['active'] } })).matched).toBe(true);
    // multi-element arrays keep list semantics
    expect(evaluateRules(eq, ctx({ query: { status: ['active', 'off'] } })).matched).toBe(false);
  });

  it('not applies to empty groups', () => {
    // NOT(空 AND=true) → false；NOT(空 OR=false) → true
    const notEmptyAnd: ConditionRule = { type: 'group', combinator: 'and', children: [], not: true };
    expect(evaluateRules(notEmptyAnd, ctx()).matched).toBe(false);
    const notEmptyOr: ConditionRule = { type: 'group', combinator: 'or', children: [], not: true };
    expect(evaluateRules(notEmptyOr, ctx()).matched).toBe(true);
    const emptyAnd: ConditionRule = { type: 'group', combinator: 'and', children: [] };
    expect(evaluateRules(emptyAnd, ctx()).matched).toBe(true);
  });

  it('matches regex with invalid-regex warning', () => {
    const rule: ConditionRule = { type: 'rule', source: 'query', field: 'q', op: 'matches', value: '^he' };
    expect(evaluateRules(rule, ctx({ query: { q: 'hello' } })).matched).toBe(true);
    const bad: ConditionRule = { type: 'rule', source: 'query', field: 'q', op: 'matches', value: '([' };
    const result = evaluateRules(bad, ctx({ query: { q: 'x' } }));
    expect(result.matched).toBe(false);
    expect(result.warning).toContain('invalid regex');
  });

  it('env source', () => {
    const rule: ConditionRule = { type: 'rule', source: 'env', field: 'REGION', op: 'eq', value: 'cn' };
    expect(evaluateRules(rule, ctx({ env: { REGION: 'cn' } })).matched).toBe(true);
  });

  it('method source', () => {
    const rule: ConditionRule = { type: 'rule', source: 'method', field: '', op: 'eq', value: 'POST' };
    expect(evaluateRules(rule, ctx({ method: 'POST' })).matched).toBe(true);
  });
});
