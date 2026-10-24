import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../password-policy';
import type { PermissionKey } from '../permissions';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Ingresá un email válido')
  .max(254);

export const loginSchema = z.object({
  email: emailSchema,
  // En login no se aplica la política (solo largo máximo) para no filtrar información.
  password: z.string().min(1, 'Ingresá tu contraseña').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'El código tiene 6 dígitos');

export const mfaVerifySchema = z.union([
  z.object({ code: totpCodeSchema }),
  z.object({
    recoveryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/, 'Código de recuperación inválido'),
  }),
]);
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaConfirmSchema = z.object({ code: totpCodeSchema });
export type MfaConfirmInput = z.infer<typeof mfaConfirmSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Próximo paso que tiene que completar el usuario después del login. */
export type AuthNextStep = 'MFA_VERIFY' | 'MFA_SETUP' | 'CHANGE_PASSWORD' | 'DONE';

export type LoginResponse = { next: AuthNextStep };

export type MeResponse = {
  id: string;
  email: string;
  fullName: string;
  roles: { key: string; name: string }[];
  permissions: PermissionKey[];
  mfaRequired: boolean;
  mfaEnabled: boolean;
  next: AuthNextStep;
};

export type MfaSetupResponse = {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
};

export type MfaConfirmResponse = { recoveryCodes: string[] };

export type SessionInfo = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
};
