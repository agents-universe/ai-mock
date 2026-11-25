import type { FastifyInstance } from 'fastify';
import { tokenCreateSchema } from '@ai-mock/shared';
import { createToken, listTokens, revokeToken } from '../auth/tokens.js';
import { notFound } from '../util/errors.js';

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tokens', async () => listTokens());

  app.post('/api/tokens', async (req, reply) => {
    const body = tokenCreateSchema.parse(req.body);
    const { token, record } = createToken(body.name);
    reply.status(201);
    // plaintext is returned exactly once, here only
    return { ...record, token };
  });

  app.delete('/api/tokens/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id.startsWith('env:')) {
      throw notFound('env_token', '环境变量 token 请通过取消设置 AIMOCK_TOKEN 吊销');
    }
    if (!revokeToken(id)) throw notFound('token_not_found', 'token 不存在');
    reply.status(204);
    return null;
  });
}
