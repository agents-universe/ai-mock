import type { FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

/**
 * Stateless Streamable HTTP at /mcp — a fresh server+transport per request,
 * no session store. GET/DELETE are accepted by the route but the transport
 * answers 405 in stateless mode (no standalone SSE stream), which is correct.
 */
export function registerMcpHttp(app: FastifyInstance): void {
  const handler = async (req: any, reply: any) => {
    // stateless mode: no standalone SSE stream (GET) and no session to end
    // (DELETE) — answer 405 per the streamable-HTTP spec instead of hanging
    if (req.method !== 'POST') {
      reply
        .status(405)
        .header('allow', 'POST')
        .send({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed (stateless /mcp accepts POST only)' },
          id: null,
        });
      return;
    }
    // we write to reply.raw ourselves — Fastify's reply pipeline must not run
    reply.hijack();
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    };
    reply.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);
    try {
      await server.connect(transport);
      // Fastify already parsed application/json — pass it as parsedBody
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      cleanup();
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'internal_error', message: String(err) }));
      } else {
        reply.raw.end();
      }
    }
  };

  app.route({ method: ['POST', 'GET', 'DELETE'], url: '/mcp', handler });
}
