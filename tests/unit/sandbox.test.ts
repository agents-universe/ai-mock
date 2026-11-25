import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@ai-mock/shared';
import { runScript, ScriptError } from '../../server/src/script/sandbox.js';

function ctx(): RequestContext {
  return {
    method: 'GET',
    path: '/api/x',
    params: {},
    query: { q: '1' },
    headers: {},
    body: { amount: 5 },
    env: {},
  };
}

describe('script sandbox', () => {
  it('returns object as JSON body', async () => {
    const r = await runScript('return { ok: true, q: req.query.q };', ctx(), {});
    expect(r.body).toEqual({ ok: true, q: '1' });
  });

  it('returns string as-is', async () => {
    const r = await runScript("return 'plain';", ctx(), {});
    expect(r.body).toBe('plain');
  });

  it('undefined body becomes empty', async () => {
    const r = await runScript('const x = 1;', ctx(), {});
    expect(r.body).toBeUndefined();
  });

  it('supports setStatus/setHeader/delay effects', async () => {
    const r = await runScript(
      'setStatus(202); setHeader("X-Custom", "yes"); delay(50); return {ok:1};',
      ctx(),
      {}
    );
    expect(r.effects.status).toBe(202);
    expect(r.effects.headers).toEqual({ 'X-Custom': 'yes' });
    expect(r.effects.delayMs).toBe(50);
  });

  it('supports await helpers.sleep', async () => {
    const r = await runScript('await helpers.sleep(10); return { done: true };', ctx(), {});
    expect(r.body).toEqual({ done: true });
  });

  it('exposes env variables', async () => {
    const r = await runScript('return { region: env.REGION };', ctx(), { REGION: 'cn' });
    expect(r.body).toEqual({ region: 'cn' });
  });

  it('exposes faker', async () => {
    const r = await runScript('return { email: faker.internet.email() };', ctx(), {});
    expect(String((r.body as any).email)).toContain('@');
  });

  it('rejects on timeout', async () => {
    await expect(
      runScript('while(true) {}', ctx(), {}, { timeoutMs: 200 })
    ).rejects.toThrow(ScriptError);
  });

  it('rejects async timeout', async () => {
    await expect(
      runScript('await helpers.sleep(5000); return 1;', ctx(), {}, { timeoutMs: 200 })
    ).rejects.toThrow(/超时/);
  });

  it('times out a blocking loop that runs AFTER an await', async () => {
    // the historical killer: vm timeout only covers the sync segment, and
    // the event-loop timer couldn't fire while the continuation spun —
    // this used to hang the entire server forever
    const t0 = Date.now();
    await expect(
      runScript('await helpers.sleep(1); while(true) {}', ctx(), {}, { timeoutMs: 300 })
    ).rejects.toThrow(ScriptError);
    expect(Date.now() - t0).toBeLessThan(8000);
  });

  it('blocks eval/code generation', async () => {
    await expect(runScript('return eval("1+1");', ctx(), {})).rejects.toThrow(ScriptError);
  });

  it('reports syntax errors', async () => {
    await expect(runScript('return {{{', ctx(), {})).rejects.toThrow(/语法错误/);
  });

  it('rejects out-of-range setStatus as script_error material', async () => {
    // setStatus(1000) used to leak through and crash reply.send with
    // ERR_INVALID_HTTP_TOKEN (a raw 500 instead of script_error)
    await expect(runScript('setStatus(1000); return {ok:1};', ctx(), {})).rejects.toThrow(
      /100-599/
    );
  });

  it('rejects invalid setHeader name/value', async () => {
    await expect(runScript('setHeader("X Bad", "1"); return {};', ctx(), {})).rejects.toThrow(
      /setHeader/
    );
    await expect(
      runScript('setHeader("X-A", "a\\nb"); return {};', ctx(), {})
    ).rejects.toThrow(/setHeader/);
  });

  it('a poisoned warm worker does not break the next job', async () => {
    // job A succeeds but leaves a continuation that blocks the worker
    // shortly AFTER A completed — without warm-slot detection + retry,
    // the next job sat until the 15s boot timeout and then failed
    await runScript(
      'helpers.sleep(150).then(() => { while (true) {} }); return { a: 1 };',
      ctx(),
      {},
      { timeoutMs: 1000 }
    );
    await new Promise((r) => setTimeout(r, 250)); // let the poison fire
    const t0 = Date.now();
    const r = await runScript('return { ok: true };', ctx(), {}, { timeoutMs: 1000 });
    expect(r.body).toEqual({ ok: true });
    expect(Date.now() - t0).toBeLessThan(8000);
  });

  it('a job poisoned AFTER it started still succeeds via retry', async () => {
    // A leaves a poison that fires while B is already running (past the
    // `started` handshake) — the exec-timeout path must retry too, not
    // report a bogus "script timeout" for an innocent job
    await runScript(
      'helpers.sleep(300).then(() => { while (true) {} }); return { a: 1 };',
      ctx(),
      {},
      { timeoutMs: 1000 }
    );
    const t0 = Date.now();
    const r = await runScript('await helpers.sleep(600); return { b: true };', ctx(), {}, {
      timeoutMs: 1500,
    });
    expect(r.body).toEqual({ b: true });
    expect(Date.now() - t0).toBeLessThan(10000);
  });

  it('has no require/process in context', async () => {
    const r = await runScript(
      'return { hasRequire: typeof require, hasProcess: typeof process };',
      ctx(),
      {}
    );
    expect(r.body).toEqual({ hasRequire: 'undefined', hasProcess: 'undefined' });
  });
});
