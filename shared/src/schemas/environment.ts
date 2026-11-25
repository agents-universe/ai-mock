import { z } from 'zod';
import { slugSchema, variablesSchema } from './common.js';

export const environmentCreateSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  variables: variablesSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const environmentUpdateSchema = environmentCreateSchema.partial();

export type EnvironmentCreateBody = z.infer<typeof environmentCreateSchema>;
export type EnvironmentUpdateBody = z.infer<typeof environmentUpdateSchema>;
