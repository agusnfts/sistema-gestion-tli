import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { isLocked, lockUntilAfterFailure } from './lockout';
import { computeNextStep } from './next-step';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from './mfa-crypto';

describe('lockUntilAfterFailure', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const minutes = (d: Date | null) => (d ? (d.getTime() - now.getTime()) / 60_000 : null);

  it('no bloquea antes del quinto fallo', () => {
    expect(lockUntilAfterFailure(4, now)).toBeNull();
  });

  it('bloquea 15, 30 y 60 minutos en los fallos 5, 10 y 15', () => {
    expect(minutes(lockUntilAfterFailure(5, now))).toBe(15);
    expect(minutes(lockUntilAfterFailure(10, now))).toBe(30);
    expect(minutes(lockUntilAfterFailure(15, now))).toBe(60);
  });

  it('no bloquea entre múltiplos', () => {
    expect(lockUntilAfterFailure(7, now)).toBeNull();
  });

  it('topea en 24 horas', () => {
    expect(minutes(lockUntilAfterFailure(100, now))).toBe(24 * 60);
  });

  it('isLocked compara contra la hora actual', () => {
    expect(isLocked(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLocked(new Date(now.getTime() - 1000), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});

describe('computeNextStep', () => {
  const base = {
    mfaRequired: true,
    mfaEnabled: true,
    sessionMfaVerified: true,
    mustChangePassword: false,
  };

  it('DONE cuando no falta nada', () => {
    expect(computeNextStep(base)).toBe('DONE');
  });

  it('verifica MFA antes de permitir el cambio de contraseña', () => {
    expect(computeNextStep({ ...base, sessionMfaVerified: false, mustChangePassword: true })).toBe(
      'MFA_VERIFY',
    );
  });

  it('pide cambiar la contraseña temporal antes de configurar MFA', () => {
    expect(computeNextStep({ ...base, mfaEnabled: false, mustChangePassword: true })).toBe(
      'CHANGE_PASSWORD',
    );
    expect(computeNextStep({ ...base, mfaEnabled: false })).toBe('MFA_SETUP');
  });

  it('no pide MFA a un usuario común', () => {
    expect(
      computeNextStep({
        mfaRequired: false,
        mfaEnabled: false,
        sessionMfaVerified: false,
        mustChangePassword: false,
      }),
    ).toBe('DONE');
  });
});

describe('mfa-crypto', () => {
  const key = randomBytes(32);

  it('cifra y descifra secretos', () => {
    const secret = generateTotpSecret();
    const enc = encryptSecret(secret, key);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc, key)).toBe(secret);
  });

  it('falla con otra clave (GCM autentica)', () => {
    const enc = encryptSecret('abc', key);
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });

  it('acepta un código válido y rechaza su reutilización', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const step = verifyTotp(code, secret, null);
    expect(step).not.toBeNull();
    expect(verifyTotp(code, secret, step)).toBeNull();
  });

  it('rechaza un código incorrecto', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(verifyTotp(wrong, secret, null)).toBeNull();
  });

  it('genera 10 códigos de recuperación únicos y normaliza el hash', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const c = codes[0]!;
    expect(hashRecoveryCode(c)).toBe(hashRecoveryCode(c.replace('-', '').toUpperCase()));
  });
});
