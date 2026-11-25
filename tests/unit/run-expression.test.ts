import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@ai-mock/shared';
import { runExpression } from '../../server/src/conditions/run-expression.js';

function ctx(): RequestContext {
  return {
    method: 'GET',
    path: '/api/x',
    params: {},
    query: { q: '1' },
    headers: {},
    body: undefined,
    env: {},
  };
}

describe('runExpression', () => {
  it('evaluates plain expressions', async () => {
    expect((await runExpression('req.query.q === "1"', ctx(), {})).value).toBe(true);
    expect((await runExpression('req.query.q === "2"', ctx(), {})).value).toBe(false);
  });

  it('tolerates trailing // comments and semicolons', async () => {
    // the old wrapper put `))()` on the same line, so a trailing comment
    // swallowed the closing tokens and the branch never matched
    expect((await runExpression('true // some note', ctx(), {})).value).toBe(true);
    expect((await runExpression('true;', ctx(), {})).value).toBe(true);
    // combined form: semicolon followed by a comment
    expect((await runExpression('true; // c', ctx(), {})).value).toBe(true);
    expect((await runExpression('req.query.q === "1"; // check', ctx(), {})).value).toBe(true);
    // semicolon followed by a block comment (copy-paste from code editors)
    expect((await runExpression('true; /* c */', ctx(), {})).value).toBe(true);
    expect((await runExpression('req.query.q === "1"; /* check */', ctx(), {})).value).toBe(true);
  });

  it('reports syntax errors for fail-open handling', async () => {
    const r = await runExpression('this is not valid js (((', ctx(), {});
    expect(r.value).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('a blocking loop after await fails open instead of hanging', async () => {
    const t0 = Date.now();
    const r = await runExpression(
      'await helpers.sleep(1).then(() => { while (true) {} })',
      ctx(),
      {}
    );
    expect(r.value).toBe(false);
    expect(r.error).toMatch(/超时/);
    expect(Date.now() - t0).toBeLessThan(8000);
  });
});
