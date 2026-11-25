import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApp, teardownApp, request, type TestEnv } from './helpers.js';
import { config } from '../../server/src/config.js';

let env: TestEnv;

beforeAll(async () => {
  delete process.env.AIMOCK_TOKEN;
  env = await setupApp();
});

afterAll(async () => {
  await teardownApp(env);
  delete process.env.AIMOCK_TOKEN;
  config.requireMockAuth = false;
});

describe('auth: open by default (no tokens configured)', () => {
  it('admin API is open', async () => {
    const res = await request(env.app).get('/api/projects');
    expect(res.status).toBe(200);
  });

  it('health is open', async () => {
    const res = await request(env.app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('can create the first token (bootstrap)', async () => {
    const res = await request(env.app)
      .post('/api/tokens')
      .send({ name: 'bootstrap' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(20);
    // creating the first token turns auth ON — management now needs that token
    const del = await request(env.app)
      .delete(`/api/tokens/${res.body.id}`)
      .set('authorization', `Bearer ${res.body.token}`);
    expect(del.status).toBe(204);
    // file is empty again → open until AIMOCK_TOKEN is set
    const open = await request(env.app).get('/api/projects');
    expect(open.status).toBe(200);
  });
});

describe('auth: enforced once AIMOCK_TOKEN is set', () => {
  beforeAll(() => {
    process.env.AIMOCK_TOKEN = 'secret-one';
  });

  it('rejects /api without a token', async () => {
    const res = await request(env.app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('accepts /api with the env token', async () => {
    const res = await request(env.app)
      .get('/api/projects')
      .set('authorization', 'Bearer secret-one');
    expect(res.status).toBe(200);
  });

  it('rejects invalid tokens', async () => {
    const res = await request(env.app)
      .get('/api/projects')
      .set('authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('keeps /api/health open', async () => {
    const res = await request(env.app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('rejects /mcp without a token', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('keeps /mock open by default', async () => {
    // project may not exist yet — any non-401 response proves auth did not run
    const res = await request(env.app).get('/mock/auth-proj/dev/anything');
    expect(res.status).not.toBe(401);
  });

  it('file tokens work alongside env tokens and can be revoked', async () => {
    const created = await request(env.app)
      .post('/api/tokens')
      .set('authorization', 'Bearer secret-one')
      .send({ name: 'second' });
    expect(created.status).toBe(201);
    const plain = created.body.token as string;

    const ok = await request(env.app)
      .get('/api/projects')
      .set('authorization', `Bearer ${plain}`);
    expect(ok.status).toBe(200);

    const del = await request(env.app)
      .delete(`/api/tokens/${created.body.id}`)
      .set('authorization', 'Bearer secret-one');
    expect(del.status).toBe(204);

    const revoked = await request(env.app)
      .get('/api/projects')
      .set('authorization', `Bearer ${plain}`);
    expect(revoked.status).toBe(401);

    // env token still valid
    const still = await request(env.app)
      .get('/api/projects')
      .set('authorization', 'Bearer secret-one');
    expect(still.status).toBe(200);
  });
});

describe('auth: AIMOCK_REQUIRE_MOCK_AUTH', () => {
  beforeAll(() => {
    process.env.AIMOCK_TOKEN = 'secret-one';
    config.requireMockAuth = true;
  });
  afterAll(() => {
    config.requireMockAuth = false;
  });

  it('rejects /mock without a token when the switch is on', async () => {
    const res = await request(env.app).get('/mock/auth-proj/dev/anything');
    expect(res.status).toBe(401);
  });

  it('accepts /mock with a token when the switch is on', async () => {
    const res = await request(env.app)
      .get('/mock/auth-proj/dev/anything')
      .set('authorization', 'Bearer secret-one');
    expect(res.status).not.toBe(401);
  });
});

describe('auth: back to open when all tokens are removed', () => {
  beforeAll(() => {
    delete process.env.AIMOCK_TOKEN;
    config.requireMockAuth = false;
  });

  it('admin API is open again', async () => {
    const res = await request(env.app).get('/api/projects');
    expect(res.status).toBe(200);
  });
});
