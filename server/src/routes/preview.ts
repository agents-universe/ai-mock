import type { FastifyInstance } from 'fastify';
import { previewRequestSchema } from '@ai-mock/shared';
import { runPreview } from '../services/preview-service.js';

export async function previewRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/preview/match', async (req) => {
    const body = previewRequestSchema.parse(req.body);
    return runPreview(body);
  });
}
