import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApp, teardownApp, type TestEnv } from './helpers.js';

let env: TestEnv;

const JSON_RPC_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function rpc(id: number, method: string, params: unknown = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

beforeAll(async () => {
  env = await setupApp();
});

afterAll(async () => {
  await teardownApp(env);
  delete process.env.AIMOCK_TOKEN;
});

describe('MCP streamable HTTP transport', () => {
  it('answers initialize', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: JSON_RPC_HEADERS,
      payload: rpc(1, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = parseRpc(res);
    expect(body.result.serverInfo.name).toBe('ai-mock');
  });

  it('lists tools', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: JSON_RPC_HEADERS,
      payload: rpc(2, 'tools/list'),
    });
    expect(res.statusCode).toBe(200);
    const body = parseRpc(res);
    const names = body.result.tools.map((t: any) => t.name);
    expect(names).toContain('list_projects');
    expect(names).toContain('simulate_request');
  });

  it('calls a tool end-to-end', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: JSON_RPC_HEADERS,
      payload: rpc(3, 'tools/call', {
        name: 'create_project',
        arguments: { slug: 'http-proj', name: 'HTTP Proj' },
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = parseRpc(res);
    expect(body.result.isError).toBeFalsy();
    const created = JSON.parse(body.result.content[0].text);
    expect(created.slug).toBe('http-proj');
  });

  it('GET/DELETE are 405 in stateless mode (no standalone SSE stream)', async () => {
    const get = await env.app.inject({
      method: 'GET',
      url: '/mcp',
      headers: { accept: 'text/event-stream' },
    });
    expect(get.statusCode).toBe(405);

    // no content-type: an empty JSON body would be rejected by Fastify's
    // body parser before reaching the route
    const del = await env.app.inject({
      method: 'DELETE',
      url: '/mcp',
      headers: { accept: 'application/json, text/event-stream' },
    });
    expect(del.statusCode).toBe(405);
  });

  it('returns 401 when a token is configured and the header is missing', async () => {
    process.env.AIMOCK_TOKEN = 'http-secret';
    try {
      const res = await env.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: JSON_RPC_HEADERS,
        payload: rpc(4, 'tools/list'),
      });
      expect(res.statusCode).toBe(401);

      const ok = await env.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...JSON_RPC_HEADERS, authorization: 'Bearer http-secret' },
        payload: rpc(5, 'tools/list'),
      });
      expect(ok.statusCode).toBe(200);
    } finally {
      delete process.env.AIMOCK_TOKEN;
    }
  });
});

function parseRpc(res: { body: string }): any {
  // stateless transport answers with application/json (no SSE stream for plain POSTs)
  const text = res.body;
  if (text.startsWith('event:')) {
    // SSE-wrapped: take the data line of the first message
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(line!.slice(5));
  }
  return JSON.parse(text);
}
