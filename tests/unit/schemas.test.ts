import { describe, expect, it } from 'vitest';
import { apiCreateSchema, branchCreateSchema, headersSchema } from '@ai-mock/shared';

describe('apiCreateSchema.path', () => {
  const base = { name: 'x', method: 'GET' as const };

  it('rejects path-to-regexp special chars that crash the matcher', () => {
    // path-to-regexp v8 throws "Unexpected (" — one bad path used to take
    // down every mock request for the whole project
    expect(apiCreateSchema.safeParse({ ...base, path: '/api/(old)/users' }).success).toBe(false);
    expect(apiCreateSchema.safeParse({ ...base, path: '/api/a+b' }).success).toBe(false);
    expect(apiCreateSchema.safeParse({ ...base, path: '/api/a?' }).success).toBe(false);
    expect(apiCreateSchema.safeParse({ ...base, path: '/api/a!b' }).success).toBe(false);
  });

  it('still accepts params, wildcards and unicode', () => {
    expect(apiCreateSchema.safeParse({ ...base, path: '/api/users/:id' }).success).toBe(true);
    expect(apiCreateSchema.safeParse({ ...base, path: '/files/*' }).success).toBe(true);
    expect(apiCreateSchema.safeParse({ ...base, path: '/api/用户' }).success).toBe(true);
  });

  it('requires a leading slash', () => {
    expect(apiCreateSchema.safeParse({ ...base, path: 'api/x' }).success).toBe(false);
  });
});

describe('headersSchema', () => {
  it('accepts normal headers', () => {
    expect(headersSchema.safeParse({ 'X-Custom': 'yes' }).success).toBe(true);
    expect(headersSchema.safeParse({ 'content-type': 'application/json' }).success).toBe(true);
  });

  it('rejects CRLF injection and invalid tokens', () => {
    // these used to save fine and then 500 every response of that branch
    expect(headersSchema.safeParse({ 'X-Bad\nInjected': 'v' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X-Ok': 'v\r\nSet-Cookie: a=b' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X Space': 'v' }).success).toBe(false);
    expect(headersSchema.safeParse({ '': 'v' }).success).toBe(false);
  });
});


describe('headers control chars (Node checkInvalidHeaderChar)', () => {
  it('rejects VT/FF/DEL/NUL/non-latin1, allows tab', () => {
    expect(headersSchema.safeParse({ 'X-A': 'a\u000bb' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X-A': 'a\u000cb' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X-A': 'a\u007fb' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X-A': 'a\u0000b' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X-A': '中文' }).success).toBe(false);
    expect(headersSchema.safeParse({ 'X-A': 'a\u0009b' }).success).toBe(true);
    expect(headersSchema.safeParse({ 'X-A': 'plain' }).success).toBe(true);
  });

  it('contentType rejects chars that would 500 branch responses', () => {
    expect(branchCreateSchema.safeParse({ name: 'b', contentType: 'application/json\u000bb' }).success).toBe(false);
    expect(branchCreateSchema.safeParse({ name: 'b', contentType: 'application/json' }).success).toBe(true);
  });
});
