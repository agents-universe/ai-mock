import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/{src,dist} → repo root
const repoRoot = path.resolve(here, '../..');

export const config = {
  port: Number(process.env.PORT ?? 3210),
  host: process.env.HOST ?? '127.0.0.1',
  // lazy so tests can set AIMOCK_DATA_DIR after module load (ESM imports hoist)
  get dataDir(): string {
    return process.env.AIMOCK_DATA_DIR ?? path.join(repoRoot, 'data');
  },
  repoRoot,
  /** when true, /mock/* also requires a Bearer token (only if tokens are configured) */
  requireMockAuth: process.env.AIMOCK_REQUIRE_MOCK_AUTH === 'true',
};
