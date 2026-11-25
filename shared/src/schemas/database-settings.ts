import { z } from 'zod';

export const databaseSettingsSchema = z.discriminatedUnion('client', [
  z.object({
    client: z.literal('sqlite'),
    connection: z.object({ filename: z.string().min(1).max(1024) }),
  }),
  z.object({
    client: z.literal('mysql'),
    connection: z.object({
      host: z.string().min(1).max(255),
      port: z.number().int().min(1).max(65535),
      user: z.string().min(1).max(255),
      password: z.string().max(255).default(''),
      database: z.string().min(1).max(255),
    }),
  }),
  z.object({
    client: z.literal('mssql'),
    connection: z.object({
      host: z.string().min(1).max(255),
      port: z.number().int().min(1).max(65535).default(1433),
      user: z.string().min(1).max(255),
      password: z.string().max(255).default(''),
      database: z.string().min(1).max(255),
      options: z
        .object({
          encrypt: z.boolean().default(false),
          trustServerCertificate: z.boolean().default(true),
        })
        .optional(),
    }),
  }),
]);

export type DatabaseSettingsBody = z.infer<typeof databaseSettingsSchema>;
