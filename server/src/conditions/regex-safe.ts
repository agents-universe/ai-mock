import vm from 'node:vm';

export interface RegexTestResult {
  matched: boolean;
  warning?: string;
}

// shared empty context; each test compiles a tiny throwaway script
const sandbox = vm.createContext(Object.create(null));

const DEFAULT_TIMEOUT_MS = 200;

/**
 * Run an untrusted regex with a hard wall-clock budget.
 *
 * `RegExp.test` is native and synchronous: a catastrophic pattern such as
 * `(a+)+$` blocks the event loop for seconds/minutes with no way to
 * interrupt it from a timer. Running the test inside `vm` lets V8's
 * interrupt mechanism cut it off at the timeout (verified: a 26s backtracking
 * case aborts at ~200ms). Safe patterns finish in microseconds.
 */
export function testRegexSafe(
  pattern: string,
  input: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): RegexTestResult {
  try {
    // JSON.stringify produces a safe JS string literal for both operands
    const script = new vm.Script(
      `new RegExp(${JSON.stringify(pattern)}).test(${JSON.stringify(input)})`
    );
    const matched = script.runInContext(sandbox, { timeout: timeoutMs });
    return { matched: Boolean(matched) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timed out/i.test(message)) {
      return {
        matched: false,
        warning: `regex 执行超时 (${timeoutMs}ms)，疑似灾难性回溯: ${pattern}`,
      };
    }
    return { matched: false, warning: `invalid regex: ${pattern}` };
  }
}
