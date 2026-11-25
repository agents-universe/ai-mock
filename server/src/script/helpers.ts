import { randomUUID } from 'node:crypto';

export interface ScriptHelpers {
  uuid(): string;
  randomInt(min: number, max: number): number;
  randomFloat(min: number, max: number, digits?: number): number;
  pick<T>(arr: T[]): T;
  sleep(ms: number): Promise<void>;
  now(): number;
  isoNow(): string;
  format(template: string, vars: Record<string, unknown>): string;
}

export const helpers: ScriptHelpers = {
  uuid: () => randomUUID(),
  randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  randomFloat: (min, max, digits = 2) => {
    const n = Math.random() * (max - min) + min;
    return Number(n.toFixed(digits));
  },
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10_000))),
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
  format: (template, vars) =>
    template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)),
};

// freeze so one script can't do `helpers.format = …` and poison every
// other script until process restart (sandbox scripts run non-strict by
// default, so assignments silently no-op instead of throwing)
for (const value of Object.values(helpers)) {
  if (typeof value === 'function') Object.freeze(value);
}
Object.freeze(helpers);
