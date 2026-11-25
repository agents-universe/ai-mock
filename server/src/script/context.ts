import type { RequestContext } from '@ai-mock/shared';
import { faker as fakerInstance } from '@faker-js/faker';
import { helpers, type ScriptHelpers } from './helpers.js';

export interface ScriptEffects {
  status?: number;
  headers: Record<string, string>;
  delayMs?: number;
}

export interface ScriptContext {
  req: RequestContext;
  env: Record<string, string>;
  helpers: ScriptHelpers;
  faker: typeof fakerInstance;
  setStatus(code: number): void;
  setHeader(name: string, value: string): void;
  delay(ms: number): void;
  __effects: ScriptEffects;
}

function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj && typeof obj === 'object' && !seen.has(obj)) {
    seen.add(obj);
    for (const value of Object.values(obj as object)) deepFreeze(value, seen);
    Object.freeze(obj);
  }
  return obj;
}

/**
 * Read-only view of an object graph: property assignment from sandbox code
 * is blocked (silently fails in non-strict mode) while normal reads and
 * method calls — including internal state changes like `faker.seed()` —
 * keep working. Prevents one script mutating shared singletons.
 */
function readonlyView<T extends object>(target: T, seen = new WeakMap<object, unknown>()): T {
  if (seen.has(target)) return seen.get(target) as T;
  const proxy = new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop);
      if (value !== null && typeof value === 'object') {
        return readonlyView(value as object, seen);
      }
      return value;
    },
    set() {
      return false;
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  });
  seen.set(target, proxy);
  return proxy as T;
}

export function buildScriptContext(
  requestContext: RequestContext,
  envVars: Record<string, string>
): ScriptContext {
  const effects: ScriptEffects = { headers: {} };
  const ctx: ScriptContext = {
    req: deepFreeze(structuredClone(requestContext)) as RequestContext,
    env: { ...envVars },
    helpers,
    faker: readonlyView(fakerInstance),
    setStatus(code) {
      // reject out-of-range codes here so they surface as script_error
      // instead of a raw ERR_INVALID_HTTP_TOKEN 500 from reply.send
      if (!Number.isInteger(code) || code < 100 || code > 599) {
        throw new Error(`setStatus: 状态码必须是 100-599 的整数，收到 ${String(code)}`);
      }
      effects.status = code;
    },
    setHeader(name, value) {
      // reject invalid tokens here so they surface as script_error instead
      // of ERR_INVALID_HTTP_TOKEN / ERR_INVALID_CHAR at reply time (raw 500)
      if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
        throw new Error(`setHeader: 非法的响应头名称 ${JSON.stringify(name)}`);
      }
      const v = String(value);
      // Node's checkInvalidHeaderChar — anything outside tab/printable
      // ASCII/latin1 throws ERR_INVALID_CHAR at reply time
      if (/[^\t\x20-\x7e\x80-\xff]/.test(v)) {
        throw new Error(`setHeader: 响应头值含非法字符 (${JSON.stringify(name)})`);
      }
      effects.headers[name] = v;
    },
    delay(ms) {
      const current = effects.delayMs ?? 0;
      effects.delayMs = Math.min(current + Math.max(0, ms), 60_000);
    },
    __effects: effects,
  };
  return ctx;
}
