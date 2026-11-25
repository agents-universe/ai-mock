import { z } from 'zod';
import { slugSchema } from './common.js';

export const projectCreateSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(4096).nullish(),
});

export const projectUpdateSchema = projectCreateSchema.partial();

export type ProjectCreateBody = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateBody = z.infer<typeof projectUpdateSchema>;
