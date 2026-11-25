import { EXPRESSION_TIMEOUT_MS } from '@ai-mock/shared';
import type { RequestContext } from '@ai-mock/shared';
import { runJob, JobError } from '../script/worker-pool.js';

export interface ExpressionResult {
  value: boolean;
  error?: string;
}

/**
 * Evaluate a branch condition expression in the same sandbox as scripts.
 * Any error is reported (fail-open handled by caller).
 * Runs on a worker thread so a blocking loop after `await` cannot freeze
 * the server — it just times out and the branch fails open.
 */
export async function runExpression(
  expression: string,
  requestContext: RequestContext,
  envVars: Record<string, string>
): Promise<ExpressionResult> {
  // newlines keep trailing `//` comments from swallowing the closing
  // `))()`; strip trailing `;` — including `expr; // comment` and
  // `expr; /* block */` combos — because ` (true;) ` is invalid inside
  // the paren wrapper
  const trimmed = expression
    .trim()
    .replace(/;+(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*$/, '')
    .trimEnd();
  const wrapped = `(async () => (\n${trimmed}\n))()`;

  try {
    const result = await runJob({
      wrapped,
      filename: 'condition-expression.js',
      requestContext,
      envVars,
      timeoutMs: EXPRESSION_TIMEOUT_MS,
    });
    return { value: Boolean(result.value) };
  } catch (err) {
    const error =
      err instanceof JobError && err.phase === 'timeout'
        ? `表达式超时 (${EXPRESSION_TIMEOUT_MS}ms)`
        : err instanceof Error
          ? err.message
          : String(err);
    return { value: false, error };
  }
}
