import { z } from 'zod';

/**
 * Filters for querying mock request logs.
 *
 * `matched` is an enum of the strings 'true'/'false' on purpose:
 * z.coerce.boolean() turns the string 'false' into `true`, which would
 * silently invert the filter for every query-string caller.
 */
export const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  method: z.string().max(8).optional(),
  path: z.string().max(512).optional(),
  matched: z.enum(['true', 'false']).optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  branchId: z.string().optional(),
  apiId: z.string().optional(),
  environmentId: z.string().optional(),
  /** ISO datetime; mock_logs.created_at is stored as ISO text so lexicographic >= works across dialects */
  from: z.string().max(64).optional(),
  to: z.string().max(64).optional(),
});

export type LogQueryInput = z.infer<typeof logQuerySchema>;
