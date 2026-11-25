import path from 'node:path';
import fs from 'node:fs';
import { parse as parseQueryString } from 'node:querystring';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './util/errors.js';
import { registerRoutes } from './routes/index.js';
import { registerMockRoutes } from './mock/router.js';
import { registerAuth } from './auth/plugin.js';
import { registerMcpHttp } from './mcp/http.js';
import { config } from './config.js';

export async function buildApp(opts: { serveWeb?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    bodyLimit: 1024 * 1024,
  });

  // form posts are a normal mock input — Fastify's defaults only cover
  // json/text, everything else used to die with 415 before reaching /mock
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        done(null, parseQueryString(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: '请求参数校验失败',
        details: err.flatten(),
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        error: err.code,
        message: err.message,
        details: err.details,
      });
    }
    app.log.error(err);
    const e = err as Error & { statusCode?: number; code?: string };
    const status = e.statusCode ?? 500;
    // client errors (415, bad JSON, …) must not be labelled internal_error —
    // clients that switch on `error` would treat them as server faults
    const code = status < 500 ? (e.code ?? 'bad_request') : 'internal_error';
    return reply.status(status).send({
      error: code,
      message: e.message || '服务器内部错误',
    });
  });

  app.setNotFoundHandler((req, reply) => {
    // reserved prefixes must 404 as JSON, never fall through to SPA
    if (
      req.url.startsWith('/api') ||
      req.url.startsWith('/mock') ||
      req.url.startsWith('/mcp') ||
      req.url === '/health'
    ) {
      return reply.status(404).send({
        error: 'not_found',
        message: `找不到路由: ${req.method} ${req.url}`,
      });
    }
    // SPA fallback
    if (opts.serveWeb) {
      const indexFile = path.join(config.repoRoot, 'web', 'dist', 'index.html');
      if (fs.existsSync(indexFile)) {
        return reply.type('text/html').send(fs.readFileSync(indexFile));
      }
    }
    return reply.status(404).send({ error: 'not_found', message: 'Not Found' });
  });

  registerAuth(app);
  await registerRoutes(app);
  registerMcpHttp(app);
  registerMockRoutes(app);

  if (opts.serveWeb) {
    const webDist = path.join(config.repoRoot, 'web', 'dist');
    if (fs.existsSync(webDist)) {
      const { default: fastifyStatic } = await import('@fastify/static');
      await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    }
  }

  return app;
}
