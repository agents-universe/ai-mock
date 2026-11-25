import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { RequestContext } from '@ai-mock/shared';
import type { ScriptEffects } from './context.js';

/**
 * Small pool of script worker threads.
 *
 * Why workers: node:vm timeouts only cover synchronous execution — an
 * `await` followed by a blocking loop freezes the whole event loop and no
 * timer (including the raceTimeout fallback) can ever fire, hanging every
 * request until process restart. A worker can be hard-terminated instead.
 *
 * Workers are spawned lazily (up to MAX_WORKERS), kept warm for subsequent
 * evaluations, and unref'd so an idle pool never blocks process exit.
 */

export interface ScriptJob {
  wrapped: string;
  filename: string;
  requestContext: RequestContext;
  envVars: Record<string, string>;
  timeoutMs: number;
}

export interface JobResult {
  value: unknown;
  effects: ScriptEffects;
}

export type JobPhase = 'boot' | 'timeout' | 'compile' | 'runtime';

export class JobError extends Error {
  constructor(
    message: string,
    public phase: JobPhase
  ) {
    super(message);
    this.name = 'JobError';
  }
}

// .cjs: server/package.json is type:module, a .js worker would be treated
// as ESM and the tsx require() bootstrap would fail
const WORKER_PATH = fileURLToPath(new URL('./worker.cjs', import.meta.url));
const MAX_WORKERS = 4;
// cold worker boot (tsx + context + faker) measured ~90–250ms
const BOOT_TIMEOUT_MS = 15_000;
// a warm worker answers `started` in single-digit milliseconds; if it goes
// silent it was poisoned by a previous job's leftover async continuation
const WARM_BOOT_TIMEOUT_MS = 2_000;

interface PendingJob {
  job: ScriptJob;
  resolve: (r: JobResult) => void;
  reject: (e: Error) => void;
  bootTimer?: NodeJS.Timeout;
  execTimer?: NodeJS.Timeout;
  retries?: number;
  /** warm state of the slot at dispatch — used for the poison retry */
  wasWarm?: boolean;
}

interface Slot {
  worker: Worker;
  job: PendingJob | null;
  dead: boolean;
  /** true once the worker has answered at least one job (boot is proven) */
  warm: boolean;
}

const slots: Slot[] = [];
const queue: PendingJob[] = [];

function killSlot(slot: Slot): void {
  slot.dead = true;
  slot.job = null;
  const i = slots.indexOf(slot);
  if (i >= 0) slots.splice(i, 1);
  void slot.worker.terminate();
}

function clearJobTimers(p: PendingJob): void {
  if (p.bootTimer) clearTimeout(p.bootTimer);
  if (p.execTimer) clearTimeout(p.execTimer);
  p.bootTimer = undefined;
  p.execTimer = undefined;
}

function failJob(p: PendingJob, error: Error): void {
  clearJobTimers(p);
  p.reject(error);
}

function createSlot(): Slot | null {
  if (slots.length >= MAX_WORKERS) return null;
  let worker: Worker;
  try {
    worker = new Worker(WORKER_PATH);
  } catch {
    return null;
  }
  // never keep the process alive just for idle pool workers; per-job timers
  // are referenced and cover every state where a result is still pending
  worker.unref();
  const slot: Slot = { worker, job: null, dead: false, warm: false };
  worker.on('message', (msg: unknown) => onMessage(slot, msg));
  worker.on('error', (err) => onWorkerFail(slot, err instanceof Error ? err : new Error(String(err))));
  worker.on('exit', (code) => {
    if (slot.dead) return;
    onWorkerFail(slot, new Error(`脚本 worker 异常退出 (code ${code})`));
  });
  slots.push(slot);
  return slot;
}

function onWorkerFail(slot: Slot, err: Error): void {
  const p = slot.job;
  killSlot(slot);
  if (p) failJob(p, new JobError(err.message, 'boot'));
  dispatch();
}

function onMessage(slot: Slot, raw: unknown): void {
  const msg = raw as { t?: string; ok?: boolean; phase?: string; error?: string; value?: unknown; effects?: ScriptEffects };
  const p = slot.job;

  if (msg.t === 'started') {
    if (!p || slot.dead) return;
    if (p.bootTimer) clearTimeout(p.bootTimer);
    p.bootTimer = undefined;
    p.execTimer = setTimeout(() => {
      // async continuation hung the worker's event loop — only a hard
      // terminate can recover; drop the poisoned slot
      if (slot.job === p) {
        killSlot(slot);
        // a warm worker that accepted the job but never finished may have
        // been poisoned by a *prior* job's leftover continuation (the
        // poison can strike after `started` too) — retry once on a fresh
        // worker; a genuinely hung script just times out a second time
        if (p.wasWarm && (p.retries ?? 0) < 1) {
          clearJobTimers(p);
          p.retries = (p.retries ?? 0) + 1;
          queue.unshift(p);
          dispatch();
        } else {
          failJob(p, new JobError(`脚本执行超时 (${p.job.timeoutMs}ms)`, 'timeout'));
          dispatch();
        }
      }
    }, p.job.timeoutMs);
    return;
  }

  if (msg.t === 'result') {
    if (!p || slot.dead) return;
    slot.job = null;
    slot.warm = true; // worker booted and answered — proven healthy
    clearJobTimers(p);
    if (msg.ok) {
      p.resolve({ value: msg.value, effects: msg.effects ?? { headers: {} } });
    } else {
      const phase = msg.phase === 'compile' ? 'compile' : 'runtime';
      p.reject(new JobError(msg.error ?? '未知错误', phase));
    }
    dispatch();
  }
}

function dispatch(): void {
  while (queue.length > 0) {
    let slot = slots.find((s) => !s.dead && s.job === null) ?? createSlot();
    if (!slot) return; // all busy at cap — freed slots re-dispatch on result
    const p = queue.shift();
    if (!p) return;
    const wasWarm = slot.warm;
    p.wasWarm = wasWarm;
    slot.job = p;
    p.bootTimer = setTimeout(() => {
      if (slot!.job === p) {
        killSlot(slot!);
        if (wasWarm && (p.retries ?? 0) < 1) {
          // a warm worker that stopped answering was poisoned by a *prior*
          // job's leftover async continuation (e.g. sleep().then(loop)) —
          // the current job never even started, so retry it on a fresh worker
          clearJobTimers(p);
          p.retries = (p.retries ?? 0) + 1;
          queue.unshift(p);
          dispatch();
        } else {
          failJob(
            p,
            new JobError(
              wasWarm
                ? '脚本 worker 无响应（可能已被前序任务污染）'
                : `脚本 worker 启动超时 (${BOOT_TIMEOUT_MS}ms)`,
              'boot'
            )
          );
          dispatch();
        }
      }
    }, wasWarm ? WARM_BOOT_TIMEOUT_MS : BOOT_TIMEOUT_MS);
    try {
      slot.worker.postMessage({
        wrapped: p.job.wrapped,
        filename: p.job.filename,
        requestContext: p.job.requestContext,
        envVars: p.job.envVars,
        timeoutMs: p.job.timeoutMs,
      });
    } catch (err) {
      killSlot(slot);
      failJob(
        p,
        new JobError(
          `无法提交脚本任务: ${err instanceof Error ? err.message : String(err)}`,
          'boot'
        )
      );
    }
  }
}

export function runJob(job: ScriptJob): Promise<JobResult> {
  return new Promise<JobResult>((resolve, reject) => {
    queue.push({ job, resolve, reject });
    dispatch();
  });
}
