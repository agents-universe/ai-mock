import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupApp, teardownApp, request, type TestEnv } from './helpers.js';

let env: TestEnv;

beforeAll(async () => {
  env = await setupApp();
});

afterAll(async () => {
  await teardownApp(env);
});

describe('CRUD', () => {
  let projectId: string;
  let envId: string;
  let apiId: string;

  it('health returns ok', async () => {
    const res = await request(env.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe(process.env.AIMOCK_DB_CLIENT ?? 'sqlite');
  });

  it('creates a project', async () => {
    const res = await request(env.app)
      .post('/api/projects')
      .send({ slug: 'orders', name: '订单服务' });
    expect(res.status).toBe(201);
    projectId = res.body.id;
    expect(res.body.slug).toBe('orders');
  });

  it('rejects duplicate slug', async () => {
    const res = await request(env.app)
      .post('/api/projects')
      .send({ slug: 'orders', name: 'dup' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('slug_taken');
  });

  it('rejects invalid slug', async () => {
    const res = await request(env.app)
      .post('/api/projects')
      .send({ slug: 'Bad Slug!', name: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects uncompilable api paths at write time', async () => {
    // passes the char blacklist but path-to-regexp still throws ("Missing
    // parameter name") — used to create an API that 404s forever
    const res = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: 'bad-path', method: 'GET', path: '/api/:id:' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_path');
  });

  it('lists projects with counts', async () => {
    const res = await request(env.app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.some((p: any) => p.id === projectId)).toBe(true);
  });

  it('creates an environment', async () => {
    const res = await request(env.app)
      .post(`/api/projects/${projectId}/environments`)
      .send({ slug: 'dev', name: '开发', variables: { REGION: 'cn' } });
    expect(res.status).toBe(201);
    envId = res.body.id;
    expect(res.body.variables).toEqual({ REGION: 'cn' });
  });

  it('rejects duplicate env slug in project', async () => {
    const res = await request(env.app)
      .post(`/api/projects/${projectId}/environments`)
      .send({ slug: 'dev', name: 'dup' });
    expect(res.status).toBe(409);
  });

  it('creates an API with a default branch', async () => {
    const res = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: '用户详情', method: 'GET', path: '/api/users/:id' });
    expect(res.status).toBe(201);
    apiId = res.body.id;

    const detail = await request(env.app).get(`/api/apis/${apiId}`);
    expect(detail.body.branches).toHaveLength(1);
    expect(detail.body.branches[0].isDefault).toBe(true);
    expect(detail.body.branches[0].conditionType).toBe('always');
  });

  it('rejects duplicate method+path in project', async () => {
    const res = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: 'dup', method: 'GET', path: '/api/users/:id' });
    expect(res.status).toBe(409);
  });

  it('updates an API', async () => {
    const res = await request(env.app)
      .patch(`/api/apis/${apiId}`)
      .send({ name: '用户详情v2', enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('用户详情v2');
    expect(res.body.enabled).toBe(false);
    await request(env.app).patch(`/api/apis/${apiId}`).send({ enabled: true });
  });

  it('creates a branch and enforces single default', async () => {
    const res = await request(env.app)
      .post(`/api/apis/${apiId}/branches`)
      .send({ name: '第二个', conditionType: 'always', statusCode: 201 });
    expect(res.status).toBe(201);

    // try to make another default while one exists
    const dup = await request(env.app)
      .post(`/api/apis/${apiId}/branches`)
      .send({ name: 'dup-default', isDefault: true });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toBe('duplicate_default');
  });

  it('reorders APIs', async () => {
    const other = await request(env.app)
      .post(`/api/projects/${projectId}/apis`)
      .send({ name: 'other', method: 'POST', path: '/api/orders' });
    const list = await request(env.app).get(`/api/projects/${projectId}/apis`);
    const ids = list.body.map((a: any) => a.id).reverse();
    const res = await request(env.app)
      .post(`/api/apis/${ids[0]}/reorder`)
      .send({ ids });
    expect(res.status).toBe(200);
    const after = await request(env.app).get(`/api/projects/${projectId}/apis`);
    expect(after.body.map((a: any) => a.id)).toEqual(ids);
    void other;
  });

  it('deletes cascade: project → envs, apis, branches', async () => {
    const res = await request(env.app).delete(`/api/projects/${projectId}`);
    expect(res.status).toBe(204);
    const gone = await request(env.app).get(`/api/projects/${projectId}`);
    expect(gone.status).toBe(404);
    const envs = await request(env.app).get(`/api/projects/${projectId}/environments`);
    expect(envs.status).toBe(404);
  });
});
