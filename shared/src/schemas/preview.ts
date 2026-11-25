import { z } from 'zod';
import { httpMethodSchema, headersSchema } from './common.js';

export const previewRequestSchema = z.object({
  apiId: z.string().min(1),
  envId: z.string().min(1).optional(),
  request: z.object({
    method: httpMethodSchema,
    path: z.string().min(1).max(512),
    // params/env intentionally absent: params are derived from the path by
    // the matcher and env comes from envId — the schema must not accept
    // fields the server silently ignores
    query: z.record(z.string(), z.unknown()).optional(),
    headers: headersSchema.optional(),
    body: z.unknown().optional(),
  }),
});

export type PreviewRequestBody = z.infer<typeof previewRequestSchema>;
