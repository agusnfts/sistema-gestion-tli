import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { authenticator } from 'otplib';

/** Cifrado AES-256-GCM de secretos TOTP en reposo. Formato: v1:<iv>:<tag>:<ciphertext> (base64). */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, ct] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || !ct)
    throw new Error('Formato de secreto cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

const TOTP_STEP_SECONDS = 30;
authenticator.options = { step: TOTP_STEP_SECONDS, window: 1, digits: 6 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function totpKeyUri(email: string, issuer: string, secret: string): string {
  return authenticator.keyuri(email, issuer, secret);
}

/**
 * Verifica un código TOTP (±1 paso de tolerancia) y devuelve el time-step usado,
 * o null si es inválido o ya se usó (lastUsedStep).
 */
export function verifyTotp(
  code: string,
  secret: string,
  lastUsedStep: number | null,
  now: number = Date.now(),
): number | null {
  const delta = authenticator.checkDelta(code, secret);
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / TOTP_STEP_SECONDS) + delta;
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

// Sin caracteres ambiguos.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    let raw = '';
    for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Los códigos de recuperación tienen ~50 bits aleatorios: SHA-256 alcanza (no hace falta argon2). */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/-/g, '').toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}
