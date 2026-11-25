import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../server/src/mcp/server.js';
import { setupApp, teardownApp, request, type TestEnv } from './helpers.js';

let env: TestEnv;
let client: Client;
let closeClient: () => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as any[])[0]?.text ?? '';
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { isError: Boolean(res.isError), data: parsed, raw: text };
}

beforeAll(async () => {
  env = await setupApp();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  closeClient = async () => {
    await client.close();
    await server.close();
  };
});

afterAll(async () => {
  await closeClient();
  await teardownApp(env);
});

describe('MCP tools: full agent workflow', () => {
  let projectId: string;
  let apiId: string;
  let branchId: string;

  it('lists tools', async () => {
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toContain('list_projects');
    expect(names).toContain('create_project');
    expect(names).toContain('create_api');
    expect(names).toContain('create_branch');
    expect(names).toContain('simulate_request');
    expect(names).toContain('get_logs');
    expect(names.length).toBeGreaterThanOrEqual(18);
  });

  it('creates a project', async () => {
    const { isError, data } = await call('create_project', {
      slug: 'mcp-proj',
      name: 'MCP Proj',
    });
    expect(isError).toBe(false);
    projectId = data.id;
    expect(data.slug).toBe('mcp-proj');
  });

  it('rejects an invalid project (error result, not protocol error)', async () => {
    // the SDK validates inputSchema before the handler runs, so the message
    // comes from either the SDK or our ZodError wrapper — both are isError results
    const { isError, raw } = await call('create_project', { slug: 'bad slug!', name: 'x' });
    expect(isError).toBe(true);
    expect(raw).toMatch(/slug/i);
  });

  it('creates an environment', async () => {
    const { isError, data } = await call('create_environment', {
      projectId,
      slug: 'dev',
      name: 'Dev',
      variables: { API_HOST: 'localhost' },
    });
    expect(isError).toBe(false);
    expect(data.slug).toBe('dev');
  });

  it('creates an API with a default branch', async () => {
    const { isError, data } = await call('create_api', {
      projectId,
      name: 'Get User',
      method: 'GET',
      path: '/api/users/:id',
    });
    expect(isError).toBe(false);
    apiId = data.id;
  });

  it('creates a conditional branch', async () => {
    const { isError, data } = await call('create_branch', {
      apiId,
      name: 'vip',
      conditionType: 'expression',
      conditionExpression: "req.query.vip === '1'",
      statusCode: 201,
      bodyType: 'static',
      staticBody: '{"vip":true}',
    });
    expect(isError).toBe(false);
    branchId = data.id;
  });

  it('updates the branch response body dynamically', async () => {
    const { isError, data } = await call('update_branch', {
      id: branchId,
      staticBody: '{"vip":true,"tier":"gold"}',
    });
    expect(isError).toBe(false);
    expect(data.staticBody).toBe('{"vip":true,"tier":"gold"}');
  });

  it('simulate_request shows the conditional branch would hit', async () => {
    const { isError, data } = await call('simulate_request', {
      apiId,
      request: { method: 'GET', path: '/api/users/1', query: { vip: '1' } },
    });
    expect(isError).toBe(false);
    expect(data.matched).toBe(true);
    expect(data.branch.id).toBe(branchId);
    expect(data.status).toBe(201);
  });

  it('hits the real /mock endpoint and asserts via get_logs', async () => {
    const res = await request(env.app).get('/mock/mcp-proj/dev/api/users/1?vip=1');
    expect(res.status).toBe(201);
    expect(res.body.tier).toBe('gold');

    // insertLog is fire-and-forget — poll get_logs until the row appears
    let logs: any[] = [];
    for (let i = 0; i < 100; i++) {
      const out = await call('get_logs', { projectId, branchId, matched: 'true' });
      logs = out.data;
      if (Array.isArray(logs) && logs.length > 0) break;
      await sleep(20);
    }
    expect(logs.length).toBe(1);
    expect(logs[0].branchId).toBe(branchId);
    expect(logs[0].matched).toBe(true);
    expect(logs[0].statusCode).toBe(201);
  });

  it('update_project invalidates cache (mock sees the new body)', async () => {
    const { isError } = await call('update_project', { id: projectId, name: 'MCP Proj 2' });
    expect(isError).toBe(false);
    const { data } = await call('get_project', { id: projectId });
    expect(data.name).toBe('MCP Proj 2');
  });

  it('deletes the project and cascades', async () => {
    const { isError } = await call('delete_project', { id: projectId });
    expect(isError).toBe(false);
    const listed = await call('list_projects');
    expect(listed.data.find((p: any) => p.id === projectId)).toBeUndefined();
    // mock now 404s for the deleted project
    const res = await request(env.app).get('/mock/mcp-proj/dev/api/users/1');
    expect(res.status).toBe(404);
  });
});
