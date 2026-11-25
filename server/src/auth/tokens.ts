import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface TokenRecord {
  id: string;
  name: string;
  sha256: string;
  prefix: string;
  createdAt: string;
}

/** Public view — never includes the hash. */
export interface TokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  source: 'env' | 'file';
}

function tokensFilePath(): string {
  return path.join(config.dataDir, 'tokens.json');
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Env tokens are read live on every check (not cached) so tests can toggle
 * AIMOCK_TOKEN without rebuilding the app, and so unsetting the var revokes
 * immediately.
 */
function envTokens(): string[] {
  return (process.env.AIMOCK_TOKEN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readTokenFile(): TokenRecord[] {
  try {
    const raw = fs.readFileSync(tokensFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TokenRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeTokenFile(tokens: TokenRecord[]): void {
  const file = tokensFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), 'utf8');
}

/** Auth is enforced only once at least one token exists (env or file). */
export function hasAnyTokens(): boolean {
  return envTokens().length > 0 || readTokenFile().length > 0;
}

export function isAuthorized(authorization: string | undefined): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const presented = authorization.slice(7).trim();
  if (!presented) return false;
  const hash = sha256(presented);
  if (envTokens().some((t) => sha256(t) === hash)) return true;
  return readTokenFile().some((t) => t.sha256 === hash);
}

export function listTokens(): TokenView[] {
  const fromEnv: TokenView[] = envTokens().map((t) => ({
    // env tokens have no stored id — derive a stable-looking id for display
    id: `env:${t.slice(0, 6)}`,
    name: '(env)',
    prefix: `${t.slice(0, 6)}…`,
    createdAt: '',
    source: 'env',
  }));
  const fromFile: TokenView[] = readTokenFile().map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    createdAt: t.createdAt,
    source: 'file',
  }));
  return [...fromEnv, ...fromFile];
}

/** Returns the plaintext token exactly once — only the hash is persisted. */
export function createToken(name: string): { token: string; record: TokenView } {
  const plaintext = randomBytes(24).toString('base64url');
  const record: TokenRecord = {
    id: randomUUID(),
    name,
    sha256: sha256(plaintext),
    prefix: `${plaintext.slice(0, 6)}…`,
    createdAt: new Date().toISOString(),
  };
  writeTokenFile([...readTokenFile(), record]);
  return {
    token: plaintext,
    record: {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      createdAt: record.createdAt,
      source: 'file',
    },
  };
}

/** File tokens only — env tokens are revoked by unsetting AIMOCK_TOKEN. */
export function revokeToken(id: string): boolean {
  const tokens = readTokenFile();
  const next = tokens.filter((t) => t.id !== id);
  if (next.length === tokens.length) return false;
  writeTokenFile(next);
  return true;
}
