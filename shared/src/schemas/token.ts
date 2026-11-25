import { z } from 'zod';

export const tokenCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export type TokenCreateBody = z.infer<typeof tokenCreateSchema>;
