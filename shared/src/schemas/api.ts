import { z } from 'zod';
import { httpMethodSchema } from './common.js';

export const apiCreateSchema = z.object({
  name: z.string().min(1).max(255),
  method: httpMethodSchema,
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^\//, 'path 必须以 / 开头')
    // path-to-regexp v8 throws on these (e.g. "Unexpected ( at index 5");
    // an uncompiled path used to take down matching for the whole project
    .regex(
      /^[^()?!+]+$/,
      'path 不能包含 ( ) ? ! + 等特殊字符（如需参数请用 :name，通配用 *）'
    ),
  description: z.string().max(4096).nullish(),
  enabled: z.boolean().optional(),
});

export const apiUpdateSchema = apiCreateSchema.partial();

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export type ApiCreateBody = z.infer<typeof apiCreateSchema>;
export type ApiUpdateBody = z.infer<typeof apiUpdateSchema>;
