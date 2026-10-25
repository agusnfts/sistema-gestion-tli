import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
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
    REDIS_URL: z.string().default('redis://localhost:6379'),
    QUEUE_INLINE: bool.default(false),
    STORAGE_LOCAL_DIR: z.string().default('./.storage'),
    CLAMAV_DRIVER: z.enum(['clamd', 'eicar']).default('clamd'),
    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().default(3310),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('Sistema de Gestión TLI <no-responder@ejemplo.com>'),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.CLAMAV_DRIVER === 'eicar'), {
    message: 'CLAMAV_DRIVER=eicar es solo para tests; en producción usar clamd',
    path: ['CLAMAV_DRIVER'],
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
  queue: { redisUrl: string; inline: boolean };
  storage: { dir: string };
  antivirus: { driver: 'clamd' | 'eicar'; host: string; port: number };
  /** null si no hay SMTP configurado: el mail queda deshabilitado aunque se active. */
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
  } | null;
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
    queue: { redisUrl: e.REDIS_URL, inline: e.QUEUE_INLINE },
    storage: { dir: resolve(process.cwd(), e.STORAGE_LOCAL_DIR) },
    antivirus: { driver: e.CLAMAV_DRIVER, host: e.CLAMAV_HOST, port: e.CLAMAV_PORT },
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          user: e.SMTP_USER || undefined,
          pass: e.SMTP_PASS || undefined,
          from: e.SMTP_FROM,
        }
      : null,
  };
}
