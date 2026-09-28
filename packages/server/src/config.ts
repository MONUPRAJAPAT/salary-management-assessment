import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(4000),
  databasePath: z.string().min(1).default('data/salary.sqlite'),
  /** Absolute or relative path to the built web bundle; served in production. */
  webDistPath: z.string().default('../web/dist'),
  /**
   * Generate the 10,000-employee dataset at startup if the database is empty.
   * For hosts with no persistent disk. Off unless explicitly set — see seedIfEmpty().
   */
  seedOnBoot: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databasePath: env.DATABASE_PATH,
    webDistPath: env.WEB_DIST_PATH,
    seedOnBoot: env.SEED_ON_BOOT,
  });
}
