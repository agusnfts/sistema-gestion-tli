import type { PrismaClient } from '@prisma/client';
import { appendAuditEntry } from './audit.js';
import { generateTemporaryPassword, hashPassword } from './password.js';

export type RecoverAccessResult = { userId: string; temporaryPassword: string };

/**
 * Recuperación de acceso para quien perdió la app de autenticación y los códigos de
 * recuperación (por ejemplo, el único Admin). Solo se corre desde el servidor:
 * resetea MFA, pone una contraseña temporal, desbloquea la cuenta, cierra sus sesiones
 * y lo deja registrado en la auditoría. No reactiva usuarios deshabilitados.
 */
export async function recoverAccess(
  prisma: PrismaClient,
  email: string,
): Promise<RecoverAccessResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (!user) throw new Error(`No existe un usuario con email ${email}`);
  if (user.status !== 'ACTIVE') throw new Error(`El usuario ${email} está deshabilitado`);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        mfaSecretEnc: null,
        mfaPendingSecretEnc: null,
        mfaEnabledAt: null,
        mfaLastUsedStep: null,
      },
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    const { count } = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await appendAuditEntry(tx, {
      actorId: null,
      action: 'user.access.recovered',
      entityType: 'user',
      entityId: user.id,
      ip: null,
      metadata: { via: 'cli', sessionsRevoked: count },
    });
  });
  return { userId: user.id, temporaryPassword };
}
