import { SCRIPT_TIMEOUT_MS } from '@ai-mock/shared';
import type { RequestContext } from '@ai-mock/shared';
import { runJob, JobError } from './worker-pool.js';
import type { ScriptEffects } from './context.js';

export interface ScriptResult {
  body: unknown;
  effects: ScriptEffects;
}

export class ScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptError';
  }
}

/**
 * Run a user response script inside a node:vm hosted on a worker thread.
 * User code runs within an async IIFE; `return <value>` produces the body.
 * The worker can be hard-terminated, so even a blocking loop *after* the
 * first await times out instead of freezing the whole server.
 * NOT a hardened security boundary — acceptable for a local dev tool.
 */
export async function runScript(
  code: string,
  requestContext: RequestContext,
  envVars: Record<string, string>,
  opts: { timeoutMs?: number } = {}
): Promise<ScriptResult> {
  const timeoutMs = opts.timeoutMs ?? SCRIPT_TIMEOUT_MS;
  const wrapped = `(async () => {\n${code}\n})()`;

  let result;
  try {
    result = await runJob({
      wrapped,
      filename: 'response-script.js',
      requestContext,
      envVars,
      timeoutMs,
    });
  } catch (err) {
    throw toScriptError(err, timeoutMs);
  }
  return { body: result.value, effects: result.effects };
}

function toScriptError(err: unknown, timeoutMs: number): ScriptError {
  if (err instanceof JobError) {
    if (err.phase === 'timeout' || err.phase === 'boot') {
      return new ScriptError(
        err.phase === 'boot' ? err.message : `脚本执行超时 (${timeoutMs}ms)`
      );
    }
    if (err.phase === 'compile') {
      return new ScriptError(`脚本语法错误: ${err.message}`);
    }
    // vm's own synchronous timeout arrives as a runtime error
    if (/timed out/i.test(err.message)) {
      return new ScriptError(`脚本执行超时 (${timeoutMs}ms)`);
    }
    return new ScriptError(`脚本运行出错: ${err.message}`);
  }
  return new ScriptError(
    `脚本运行出错: ${err instanceof Error ? err.message : String(err)}`
  );
}
