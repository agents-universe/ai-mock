import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function readJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
