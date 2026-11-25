import type { FastifyInstance } from 'fastify';
import { hasAnyTokens, isAuthorized } from './tokens.js';
import { config } from '../config.js';

/**
 * Bearer-token auth for /api/* (except /api/health), /mcp/*, and — when
 * AIMOCK_REQUIRE_MOCK_AUTH=true — /mock/*.
 *
 * No-op until at least one token is configured (env AIMOCK_TOKEN or
 * data/tokens.json), so default local dev and the existing test suite keep
 * working with zero config.
 */
export function registerAuth(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0];
    // health stays open for probes/uptime even when auth is on
    if (url === '/api/health') return;

    const isApi = url === '/api' || url.startsWith('/api/');
    const isMcp = url === '/mcp' || url.startsWith('/mcp/');
    const isMock = url === '/mock' || url.startsWith('/mock/');

    const protectedSurface = isApi || isMcp || (config.requireMockAuth && isMock);
    if (!protectedSurface) return;
    if (!hasAnyTokens()) return;

    if (isAuthorized(req.headers.authorization)) return;

    reply.status(401).send({
      error: 'unauthorized',
      message: '缺少或无效的 Bearer Token',
    });
  });
}
