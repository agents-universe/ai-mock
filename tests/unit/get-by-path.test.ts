import { describe, expect, it } from 'vitest';
import { getByPath } from '@ai-mock/shared';

describe('getByPath', () => {
  const obj = { a: { b: { c: 42 } }, arr: [10, 20, { x: 'y' }], s: 'str' };

  it('reads nested paths', () => {
    expect(getByPath(obj, 'a.b.c')).toBe(42);
    expect(getByPath(obj, 'arr.1')).toBe(20);
    expect(getByPath(obj, 'arr.2.x')).toBe('y');
    expect(getByPath(obj, 's')).toBe('str');
  });

  it('returns undefined for missing paths', () => {
    expect(getByPath(obj, 'a.z')).toBeUndefined();
    expect(getByPath(obj, 'nope')).toBeUndefined();
    expect(getByPath(null, 'a')).toBeUndefined();
  });

  it('blocks prototype pollution vectors', () => {
    expect(getByPath(obj, '__proto__')).toBeUndefined();
    expect(getByPath(obj, 'a.constructor')).toBeUndefined();
    expect(getByPath(obj, 'a.__proto__.polluted')).toBeUndefined();
    expect(getByPath(obj, 'constructor.prototype')).toBeUndefined();
  });
});
