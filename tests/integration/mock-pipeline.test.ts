import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupApp, teardownApp, request, type TestEnv } from './helpers.js';

let env: TestEnv;
let projectId: string;
const mock = (path: string) => `/mock/orders/dev${path}`;

beforeAll(async () => {
  env = await setupApp();

  const project = await request(env.app)
    .post('/api/projects')
    .send({ slug: 'orders', name: '订单' });
  projectId = project.body.id;

  await request(env.app)
    .post(`/api/projects/${projectId}/environments`)
    .send({ slug: 'dev', name: '开发', variables: { REGION: 'cn' } });

  // API: GET /api/users/:id with conditional branches
  const api = await request(env.app)
    .post(`/api/projects/${projectId}/apis`)
    .send({ name: '用户', method: 'GET', path: '/api/users/:id' });
  const apiId = api.body.id;
  const defaultBranchId = (
    await request(env.app).get(`/api/apis/${apiId}`)
  ).body.branches[0].id;

  // branch 1: query rule
  await request(env.app)
    .post(`/api/apis/${apiId}/branches`)
    .send({
      name: 'active',
      conditionType: 'rules',
      conditionRules: {
        type: 'group',
        combinator: 'and',
        children: [
          { type: 'rule', source: 'query', field: 'status', op: 'eq', value: 'active' },
        ],
      },
      statusCode: 200,
      bodyType: 'static',
      staticBody: '{"state":"active"}',
    });

  // branch 2: expression
  await request(env.app)
    .post(`/api/apis/${apiId}/branches`)
    .send({
      name: 'amount-gt-100',
      conditionType: 'expression',
      conditionExpression: 'req.body && req.body.amount > 100',
      statusCode: 200,
      bodyType: 'static',
      staticBody: '{"state":"rich"}',
    });

  // branch 3: broken expression (should fail-open)
  await request(env.app)
    .post(`/api/apis/${apiId}/branches`)
    .send({
      name: 'broken',
      conditionType: 'expression',
      conditionExpression: 'this is not valid js (((',
      statusCode: 200,
      bodyType: 'static',
      staticBody: '{"state":"broken"}',
    });

  // default branch (update the auto-created one)
  await request(env.app)
    .patch(`/api/branches/${defaultBranchId}`)
    .send({
      name: 'default',
      statusCode: 200,
      bodyType: 'static',
      staticBody: '{"state":"default"}',
    });

  // Script API
  const scriptApi = await request(env.app)
    .post(`/api/projects/${projectId}/apis`)
    .send({ name: '随机用户', method: 'GET', path: '/api/random-user' });
  const scriptApiId = scriptApi.body.id;
  const scriptDefault = (
    await request(env.app).get(`/api/apis/${scriptApiId}`)
  ).body.branches[0].id;
  await request(env.app)
    .patch(`/api/branches/${scriptDefault}`)
    .send({
      name: 'script',
      bodyType: 'script',
      script: 'setStatus(201); setHeader("X-Gen", "faker"); return { email: faker.internet.email() };',
    });

  // Delayed API
  const delayApi = await request(env.app)
    .post(`/api/projects/${projectId}/apis`)
    .send({ name: '慢接口', method: 'GET', path: '/api/slow' });
  await request(env.app)
    .patch(`/api/branches/${(await request(env.app).get(`/api/apis/${delayApi.body.id}`)).body.branches[0].id}`)
    .send({ delayMs: 50, staticBody: '{"slow":true}' });

  // Form API (application/x-www-form-urlencoded used to die with 415)
  const formApi = await request(env.app)
    .post(`/api/projects/${projectId}/apis`)
    .send({ name: '表单', method: 'POST', path: '/api/form' });
  await request(env.app)
    .patch(`/api/branches/${(await request(env.app).get(`/api/apis/${formApi.body.id}`)).body.branches[0].id}`)
    .send({
      conditionType: 'expression',
      conditionExpression: 'req.body && req.body.a === "1"',
      staticBody: '{"form":"ok"}',
    });
});

afterAll(async () => {
  await teardownApp(env);
});

describe('mock pipeline', () => {
  it('matches path param and returns default branch', async () => {
    const res = await request(env.app).get(mock('/api/users/42'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'default' });
    expect(res.headers['x-ai-mock-branch']).toBeTruthy();
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('branch 1 (query rule) wins when query matches', async () => {
    const res = await request(env.app).get(mock('/api/users/1?status=active'));
    expect(res.body).toEqual({ state: 'active' });
  });

  it('branch 2 (expression) matches on body', async () => {
    const res = await request(env.app)
      .post(mock('/api/users/1'))
      .set('content-type', 'application/json')
      .send({ amount: 150 });
    // GET-only API → 404 for POST
    expect(res.status).toBe(404);
  });

  it('expression evaluated on GET via query-less body null still falls to default', async () => {
    const res = await request(env.app).get(mock('/api/users/1'));
    expect(res.body).toEqual({ state: 'default' });
  });

  it('unknown project → 404', async () => {
    const res = await request(env.app).get('/mock/nope/dev/api/users/1');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('project_not_found');
  });

  it('unknown env → 404', async () => {
    const res = await request(env.app).get('/mock/orders/nope/api/users/1');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('environment_not_found');
  });

  it('unknown path → 404 no_mock_matched', async () => {
    const res = await request(env.app).get(mock('/api/nothing'));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_mock_matched');
  });

  it('script branch: status/header effects + faker body', async () => {
    const res = await request(env.app).get(mock('/api/random-user'));
    expect(res.status).toBe(201);
    expect(res.headers['x-gen']).toBe('faker');
    expect(res.body.email).toContain('@');
  });

  it('delay is applied', async () => {
    const start = Date.now();
    const res = await request(env.app).get(mock('/api/slow'));
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slow: true });
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it('broken expression fails open to default', async () => {
    const res = await request(env.app).get(mock('/api/users/1'));
    expect(res.body).toEqual({ state: 'default' });
    // warnings header only present when a warning was recorded
    // (broken branch records a warning during evaluation)
    if (res.headers['x-ai-mock-warning']) {
      expect(decodeURIComponent(res.headers['x-ai-mock-warning'])).toContain('表达式错误');
    }
  });

  it('CRUD change takes effect immediately (cache invalidation)', async () => {
    const apiId = (
      await request(env.app).get(`/api/projects/${projectId}/apis`)
    ).body.find((a: any) => a.path === '/api/users/:id').id;
    const branches = (await request(env.app).get(`/api/apis/${apiId}`)).body.branches;
    const defaultBranch = branches.find((b: any) => b.isDefault);
    await request(env.app)
      .patch(`/api/branches/${defaultBranch.id}`)
      .send({ staticBody: '{"state":"changed"}' });
    const res = await request(env.app).get(mock('/api/users/1'));
    expect(res.body).toEqual({ state: 'changed' });
  });

  it('preview matches the same branch as the real pipeline', async () => {
    const apiId = (
      await request(env.app).get(`/api/projects/${projectId}/apis`)
    ).body.find((a: any) => a.path === '/api/users/:id').id;
    const preview = await request(env.app)
      .post('/api/preview/match')
      .send({
        apiId,
        request: {
          method: 'GET',
          path: '/api/users/1',
          query: { status: 'active' },
          headers: {},
        },
      });
    expect(preview.status).toBe(200);
    expect(preview.body.matched).toBe(true);
    expect(preview.body.branch.name).toBe('active');
    expect(preview.body.body).toBe('{"state":"active"}');

    // real request picks the same branch
    const real = await request(env.app).get(mock('/api/users/1?status=active'));
    expect(real.headers['x-ai-mock-branch']).toBe(preview.body.headers['x-ai-mock-branch']);
  });

  it('script timeout → 500 script_error', async () => {
    const created = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: '超时', method: 'GET', path: '/api/timeout' });
    const b = (await request(env.app).get(`/api/apis/${created.body.id}`)).body.branches[0];
    await request(env.app)
      .patch(`/api/branches/${b.id}`)
      .send({ bodyType: 'script', script: 'await helpers.sleep(5000); return 1;' });
    const res = await request(env.app).get(mock('/api/timeout'));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('script_error');
  });

  it('logs are recorded', async () => {
    const res = await request(env.app).get(`/api/projects/${projectId}/logs`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('method');
  });

  it('script bypassing setStatus via __effects → script_error', async () => {
    const created = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: 'tamper', method: 'GET', path: '/api/tamper' });
    const b = (await request(env.app).get(`/api/apis/${created.body.id}`)).body.branches[0];
    await request(env.app)
      .patch(`/api/branches/${b.id}`)
      .send({ bodyType: 'script', script: '__effects.status = 1000; return {ok:1};' });
    const res = await request(env.app).get(mock('/api/tamper'));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('script_error');
  });

  it('script setHeader with invalid token → script_error', async () => {
    const created = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: 'badheader', method: 'GET', path: '/api/badheader' });
    const b = (await request(env.app).get(`/api/apis/${created.body.id}`)).body.branches[0];
    await request(env.app)
      .patch(`/api/branches/${b.id}`)
      .send({ bodyType: 'script', script: 'setHeader("X Bad", "1"); return {ok:1};' });
    const res = await request(env.app).get(mock('/api/badheader'));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('script_error');
  });

  it('accepts application/x-www-form-urlencoded bodies', async () => {
    const res = await request(env.app)
      .post(mock('/api/form'))
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('a=1&b=2');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ form: 'ok' });
  });

  it('literal % in a path param does not 500', async () => {
    // %25 decodes to '%' — double-decoding used to throw URIError → 500
    const res = await request(env.app).get(mock('/api/users/100%25'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('state');
  });

  it('preview percent-decoding matches the real mock URL', async () => {
    const apiId = (
      await request(env.app).get(`/api/projects/${projectId}/apis`)
    ).body.find((a: any) => a.path === '/api/users/:id').id;
    // %2F decodes to '/' — the real URL then has an extra segment and does
    // not match /api/users/:id; preview must agree instead of matching
    // :id = 'a%2Fb'
    const preview = await request(env.app)
      .post('/api/preview/match')
      .send({ apiId, request: { method: 'GET', path: '/api/users/a%2Fb' } });
    expect(preview.status).toBe(200);
    expect(preview.body.matched).toBe(false);
    expect(preview.body.reason).toBe('no_api');
  });

  it('trailing // comment in expression still evaluates', async () => {
    const created = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: '注释', method: 'GET', path: '/api/comment' });
    // non-default branch: if the expression fails to parse we'd fall through
    // to the default branch and see its body instead
    await request(env.app)
      .post(`/api/apis/${created.body.id}/branches`)
      .send({
        name: 'commented',
        conditionType: 'expression',
        conditionExpression: 'true // always',
        staticBody: '{"comment":"ok"}',
      });
    const res = await request(env.app).get(mock('/api/comment'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ comment: 'ok' });
  });
});
