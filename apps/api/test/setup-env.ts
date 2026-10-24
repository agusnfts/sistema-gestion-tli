import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Variables para e2e. En CI vienen del workflow; en local se completan con el .env de la raíz.
const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Base dedicada a tests, para no tocar la de desarrollo.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  APP_ORIGIN: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
  THROTTLE_AUTH_LIMIT: '10000',
  THROTTLE_DEFAULT_LIMIT: '10000',
});
process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
