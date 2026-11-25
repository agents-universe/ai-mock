import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApp, teardownApp, request, type TestEnv } from './helpers.js';

let env: TestEnv;
let projectId: string;
let branchId: string;
let apiId: string;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** insertLog is fire-and-forget after the mock response — poll until rows land. */
async function waitForLogs(min: number): Promise<any[]> {
  for (let i = 0; i < 100; i++) {
    const res = await request(env.app).get(`/api/projects/${projectId}/logs?limit=1000`);
    if (res.status === 200 && res.body.length >= min) return res.body;
    await sleep(20);
  }
  throw new Error(`logs did not reach ${min} rows in time`);
}

beforeAll(async () => {
  env = await setupApp();

  const project = await request(env.app)
    .post('/api/projects')
    .send({ slug: 'log-proj', name: 'Log Proj' });
  projectId = project.body.id;

  await request(env.app)
    .post(`/api/projects/${projectId}/environments`)
    .send({ slug: 'dev', name: 'Dev' });

  const api = await request(env.app)
    .post(`/api/projects/${projectId}/apis`)
    .send({ name: 'Get User', method: 'GET', path: '/api/users/:id' });
  apiId = api.body.id;

  // conditional branch evaluated before the default one
  const branch = await request(env.app)
    .post(`/api/apis/${apiId}/branches`)
    .send({
      name: 'vip',
      conditionType: 'expression',
      conditionExpression: "req.query.vip === '1'",
      statusCode: 201,
      staticBody: '{"vip":true}',
    });
  branchId = branch.body.id;

  // 1) GET matches the vip branch
  await request(env.app).get('/mock/log-proj/dev/api/users/1?vip=1');
  // 2) GET falls through to the default branch
  await request(env.app).get('/mock/log-proj/dev/api/users/2');
  // 3) POST does not match the API (method mismatch)
  await request(env.app).post('/mock/log-proj/dev/api/users/3').send({});
  // 4) unknown path — no API matched
  await request(env.app).get('/mock/log-proj/dev/nope');

  await waitForLogs(4);
});

afterAll(async () => {
  await teardownApp(env);
});

describe('log query filters', () => {
  it('returns newest first with default limit', async () => {
    const res = await request(env.app).get(`/api/projects/${projectId}/logs`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    const times = res.body.map((l: any) => l.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('filters by method', async () => {
    const res = await request(env.app).get(
      `/api/projects/${projectId}/logs?method=POST`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((l: any) => l.method === 'POST')).toBe(true);
  });

  it('filters by exact path', async () => {
    const res = await request(env.app).get(
      `/api/projects/${projectId}/logs?path=/api/users/2`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].path).toBe('/api/users/2');
  });

  it('filters matched=true / matched=false', async () => {
    const matched = await request(env.app).get(
      `/api/projects/${projectId}/logs?matched=true`
    );
    expect(matched.body.length).toBeGreaterThanOrEqual(2);
    expect(matched.body.every((l: any) => l.matched === true)).toBe(true);

    const unmatched = await request(env.app).get(
      `/api/projects/${projectId}/logs?matched=false`
    );
    expect(unmatched.body.length).toBeGreaterThanOrEqual(2);
    expect(unmatched.body.every((l: any) => l.matched === false)).toBe(true);
  });

  it('matched=false does not coerce to true (the z.coerce.boolean pitfall)', async () => {
    const res = await request(env.app).get(
      `/api/projects/${projectId}/logs?matched=false&limit=1000`
    );
    expect(res.body.some((l: any) => l.matched === true)).toBe(false);
  });

  it('filters by status code', async () => {
    const res = await request(env.app).get(
      `/api/projects/${projectId}/logs?status=201`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].statusCode).toBe(201);
    expect(res.body[0].branchId).toBe(branchId);
  });

  it('filters by branchId (assert a request hit a specific branch)', async () => {
    const res = await request(env.app).get(
      `/api/projects/${projectId}/logs?branchId=${branchId}&matched=true`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].branchId).toBe(branchId);
  });

  it('filters by apiId', async () => {
    const res = await request(env.app).get(
      `/api/projects/${projectId}/logs?apiId=${apiId}`
    );
    expect(res.status).toBe(200);
    // only the two GETs matched the API; method mismatch and unknown path log apiId=null
    expect(res.body.length).toBe(2);
    expect(res.body.every((l: any) => l.apiId === apiId)).toBe(true);
  });

  it('filters by time range (from/to)', async () => {
    const all = await request(env.app).get(
      `/api/projects/${projectId}/logs?limit=1000`
    );
    const oldest = all.body[all.body.length - 1].createdAt;
    const newest = all.body[0].createdAt;

    const inRange = await request(env.app).get(
      `/api/projects/${projectId}/logs?from=${encodeURIComponent(oldest)}&to=${encodeURIComponent(newest)}`
    );
    expect(inRange.status).toBe(200);
    expect(inRange.body.length).toBe(all.body.length);

    const futureFrom = await request(env.app).get(
      `/api/projects/${projectId}/logs?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`
    );
    expect(futureFrom.status).toBe(200);
    expect(futureFrom.body.length).toBe(0);
  });

  it('rejects invalid limit with a validation error', async () => {
    const res = await request(env.app).get(`/api/projects/${projectId}/logs?limit=0`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('404s for unknown project', async () => {
    const res = await request(env.app).get('/api/projects/does-not-exist/logs');
    expect(res.status).toBe(404);
  });
});
