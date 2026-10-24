import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_ORIGIN: z.string().url(),
  COOKIE_SECURE: bool.default(true),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SESSION_IDLE_MINUTES_PRIVILEGED: z.coerce.number().int().positive().default(30),
  SESSION_ABSOLUTE_MINUTES_PRIVILEGED: z.coerce.number().int().positive().default(720),
  SESSION_IDLE_MINUTES_STANDARD: z.coerce.number().int().positive().default(480),
  SESSION_ABSOLUTE_MINUTES_STANDARD: z.coerce.number().int().positive().default(10080),
  MFA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'Tiene que ser 32 bytes en base64'),
  MFA_ISSUER: z.string().default('Sistema de Gestión TLI'),
  THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(300),
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(10),
});

export type AppConfig = {
  env: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  appOrigin: string;
  cookieSecure: boolean;
  trustProxy: number;
  session: {
    privileged: { idleMinutes: number; absoluteMinutes: number };
    standard: { idleMinutes: number; absoluteMinutes: number };
  };
  mfa: { encryptionKey: Buffer; issuer: string };
  throttle: { defaultLimit: number; authLimit: number };
};

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detail}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.API_PORT,
    logLevel: e.LOG_LEVEL,
    appOrigin: e.APP_ORIGIN,
    cookieSecure: e.COOKIE_SECURE,
    trustProxy: e.TRUST_PROXY,
    session: {
      privileged: {
        idleMinutes: e.SESSION_IDLE_MINUTES_PRIVILEGED,
        absoluteMinutes: e.SESSION_ABSOLUTE_MINUTES_PRIVILEGED,
      },
      standard: {
        idleMinutes: e.SESSION_IDLE_MINUTES_STANDARD,
        absoluteMinutes: e.SESSION_ABSOLUTE_MINUTES_STANDARD,
      },
    },
    mfa: { encryptionKey: Buffer.from(e.MFA_ENCRYPTION_KEY, 'base64'), issuer: e.MFA_ISSUER },
    throttle: { defaultLimit: e.THROTTLE_DEFAULT_LIMIT, authLimit: e.THROTTLE_AUTH_LIMIT },
  };
}
