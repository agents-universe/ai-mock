import type { FastifyInstance } from 'fastify';
import { resolveMock, applyOutcome } from './pipeline.js';
import { insertLog } from '../db/repos/log-repo.js';
import { getProjectConfig, getEnvironmentFromConfig } from '../db/cache.js';

const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export function registerMockRoutes(app: FastifyInstance): void {
  app.route({
    method: [...ALL_METHODS],
    url: '/mock/:projectSlug/:envSlug/*',
    handler: async (req, reply) => {
      const { projectSlug, envSlug } = req.params as { projectSlug: string; envSlug: string };
      const wild = (req.params as Record<string, string>)['*'] ?? '';
      const apiPath = '/' + wild.replace(/^\/+/, '');

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
      }

      const outcome = await resolveMock({
        projectKey: projectSlug,
        envKey: envSlug,
        method: req.method,
        path: apiPath,
        query: (req.query ?? {}) as Record<string, unknown>,
        headers,
        body: req.body,
      });

      // fire-and-forget log with env resolution
      void (async () => {
        try {
          const config = await getProjectConfig(projectSlug);
          const env = config ? getEnvironmentFromConfig(config, envSlug) : null;
          await insertLog({
            projectId: config?.project.id ?? null,
            environmentId: env?.id ?? null,
            method: req.method,
            path: apiPath,
            outcome,
            requestBody: req.body,
          });
        } catch {
          /* ignore */
        }
      })();

      if (outcome.reason === 'matched') {
        await applyOutcome(outcome);
        reply.status(outcome.status);
        for (const [k, v] of Object.entries(outcome.headers)) reply.header(k, v);
        return reply.send(outcome.body === '' ? undefined : outcome.body);
      }

      reply.status(outcome.status);
      reply.header('content-type', 'application/json');
      return reply.send(outcome.body);
    },
  });

  // /mock with no segments
  app.route({
    method: [...ALL_METHODS],
    url: '/mock',
    handler: (_req, reply) => {
      reply.status(404);
      return reply.send({
        error: 'mock_path_invalid',
        message: 'Mock URL 格式: /mock/{projectSlug}/{envSlug}/{apiPath}',
      });
    },
  });
}
