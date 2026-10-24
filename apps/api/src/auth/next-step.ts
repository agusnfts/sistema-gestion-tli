import type { AuthNextStep } from '@tli/shared';

/**
 * Qué le falta completar a una sesión antes de tener acceso pleno.
 * El MFA ya configurado se verifica antes de permitir cambiar la contraseña;
 * la configuración inicial de MFA va después del cambio de contraseña temporal.
 */
export function computeNextStep(input: {
  mfaRequired: boolean;
  mfaEnabled: boolean;
  sessionMfaVerified: boolean;
  mustChangePassword: boolean;
}): AuthNextStep {
  if (input.mfaRequired && input.mfaEnabled && !input.sessionMfaVerified) return 'MFA_VERIFY';
  if (input.mustChangePassword) return 'CHANGE_PASSWORD';
  if (input.mfaRequired && !input.mfaEnabled) return 'MFA_SETUP';
  return 'DONE';
}
