import { ZodError } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AppError } from '../../util/errors.js';

export function textResult(data: unknown, isError = false): CallToolResult {
  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

/**
 * Wrap a tool handler so Zod/AppError become isError results instead of
 * opaque protocol errors — the model needs the message to self-correct.
 */
export function toolHandler<Args>(
  fn: (args: Args) => Promise<unknown>
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return textResult(await fn(args));
    } catch (err) {
      if (err instanceof ZodError) {
        return textResult(
          {
            error: 'validation_error',
            message: '参数校验失败',
            details: err.flatten(),
          },
          true
        );
      }
      if (err instanceof AppError) {
        return textResult({ error: err.code, message: err.message }, true);
      }
      return textResult(
        { error: 'internal_error', message: err instanceof Error ? err.message : String(err) },
        true
      );
    }
  };
}
