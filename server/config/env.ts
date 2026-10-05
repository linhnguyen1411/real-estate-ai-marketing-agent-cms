import crypto from 'crypto';
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

// Ephemeral fallback generator for non-production environments
function getDevEphemeralSecret(name: string): string {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn(`[SECURITY WARNING] ${name} is not set in non-production environment. Generated ephemeral secret for this session.`);
  return generated;
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters'),
  AGENT_ENABLED: z.preprocess(
    v => typeof v === 'string' ? !['0', 'false', 'off', 'no'].includes(v.toLowerCase()) : Boolean(v),
    z.boolean()
  ).default(true),
  AGENT_RUNTIME_TOKEN: z.string().optional(),
  DEFAULT_COMPANY_ID: z.string().default('comp-da-nang'),
  DEFAULT_OWNER_USER_ID: z.string().default('user-owner-1'),
  PUBLIC_CONTACTS: z.string().default('0905 777 594, 0984 755 258'),
  TELEGRAM_CONSOLE_ENABLED: z.preprocess(
    v => typeof v === 'string' ? ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()) : Boolean(v),
    z.boolean()
  ).optional(),
  TELEGRAM_ALLOWED_USER_IDS: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.TELEGRAM_CONSOLE_ENABLED && (!data.TELEGRAM_ALLOWED_USER_IDS || !data.TELEGRAM_ALLOWED_USER_IDS.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TELEGRAM_ALLOWED_USER_IDS'],
      message: 'TELEGRAM_ALLOWED_USER_IDS must not be empty when TELEGRAM_CONSOLE_ENABLED is true',
    });
  }
  if (data.NODE_ENV === 'production' && data.AGENT_ENABLED) {
    if (!data.AGENT_RUNTIME_TOKEN || data.AGENT_RUNTIME_TOKEN.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AGENT_RUNTIME_TOKEN'],
        message: 'AGENT_RUNTIME_TOKEN must be at least 32 characters in production when AGENT_ENABLED=true',
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

export function validateEnv(customEnv: Record<string, string | undefined> = process.env): EnvConfig {
  const env = { ...customEnv };

  // In non-production, supply dynamic ephemeral secrets if unset, never static fixed strings
  if (env.NODE_ENV !== 'production') {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
      env.AUTH_SECRET = getDevEphemeralSecret('AUTH_SECRET');
    }
    if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 32) {
      env.TOKEN_ENCRYPTION_KEY = getDevEphemeralSecret('TOKEN_ENCRYPTION_KEY');
    }
    if (!env.AGENT_RUNTIME_TOKEN || env.AGENT_RUNTIME_TOKEN.length < 32) {
      env.AGENT_RUNTIME_TOKEN = getDevEphemeralSecret('AGENT_RUNTIME_TOKEN');
    }
    if (!env.DATABASE_URL) {
      env.DATABASE_URL = 'postgresql://localhost:5432/mock_test';
    }
  }

  const result = envSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map(issue => `  - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');
    throw new Error(`[FATAL] Environment validation failed:\n${errorDetails}`);
  }

  cachedEnv = result.data;
  // Sync back validated ephemeral secrets to process.env so dependent modules access them
  process.env.AUTH_SECRET = cachedEnv.AUTH_SECRET;
  process.env.TOKEN_ENCRYPTION_KEY = cachedEnv.TOKEN_ENCRYPTION_KEY;
  if (cachedEnv.AGENT_RUNTIME_TOKEN) {
    process.env.AGENT_RUNTIME_TOKEN = cachedEnv.AGENT_RUNTIME_TOKEN;
  }
  return cachedEnv;
}

export function getEnv(): EnvConfig {
  if (!cachedEnv) {
    return validateEnv();
  }
  return cachedEnv;
}
