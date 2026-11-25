import { describe, expect, it } from 'vitest';
import { testRegexSafe } from '../../server/src/conditions/regex-safe.js';

describe('testRegexSafe', () => {
  it('matches and rejects invalid patterns', () => {
    expect(testRegexSafe('^he', 'hello').matched).toBe(true);
    expect(testRegexSafe('^he', 'x').matched).toBe(false);

    const bad = testRegexSafe('([', 'x');
    expect(bad.matched).toBe(false);
    expect(bad.warning).toContain('invalid regex');
  });

  it('aborts catastrophic backtracking within the budget', () => {
    // plain RegExp.test on this input blocks for ~26s; vm's interrupt
    // must cut it off at the timeout instead of freezing the server
    const t0 = Date.now();
    const result = testRegexSafe('(a+)+$', 'a'.repeat(30) + '!');
    const elapsed = Date.now() - t0;
    expect(result.matched).toBe(false);
    expect(result.warning).toContain('超时');
    expect(elapsed).toBeLessThan(3000);
  });
});
