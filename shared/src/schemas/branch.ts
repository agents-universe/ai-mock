import { z } from 'zod';
import {
  BODY_TYPES,
  CONDITION_TYPES,
  MAX_DELAY_MS,
} from '../constants.js';
import { headersSchema } from './common.js';

const ruleLeafSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('rule'),
      source: z.enum(['query', 'header', 'body', 'params', 'method', 'env']),
      field: z.string().max(256),
      op: z.enum([
        'eq',
        'ne',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'gt',
        'gte',
        'lt',
        'lte',
        'in',
        'exists',
        'not_exists',
        'matches',
      ]),
      value: z.unknown().optional(),
    }),
    z.object({
      type: z.literal('group'),
      combinator: z.enum(['and', 'or']),
      children: z.array(ruleLeafSchema).max(100),
      not: z.boolean().optional(),
    }),
  ])
);

export const conditionRuleSchema = ruleLeafSchema;

export const branchCreateSchema = z.object({
  name: z.string().min(1).max(255),
  enabled: z.boolean().optional(),
  conditionType: z.enum(CONDITION_TYPES).optional(),
  conditionRules: conditionRuleSchema.nullish(),
  conditionExpression: z.string().max(20_000).nullish(),
  isDefault: z.boolean().optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  headers: headersSchema.optional(),
  delayMs: z.number().int().min(0).max(MAX_DELAY_MS).optional(),
  contentType: z
    .string()
    .max(128)
    // same rule Node applies at reply.send — \v/\f/DEL would otherwise
    // save fine and 500 every response of this branch
    .refine(
      (v) => !/[^\t\x20-\x7e\x80-\xff]/.test(v),
      'Content-Type 含非法字符（仅支持 ASCII/latin1 可见字符）'
    )
    .optional(),
  bodyType: z.enum(BODY_TYPES).optional(),
  staticBody: z.string().max(1_000_000).nullish(),
  script: z.string().max(200_000).nullish(),
});

export const branchUpdateSchema = branchCreateSchema.partial();

export const branchReorderSchema = z.object({
  apiId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
});

export type BranchCreateBody = z.infer<typeof branchCreateSchema>;
export type BranchUpdateBody = z.infer<typeof branchUpdateSchema>;
