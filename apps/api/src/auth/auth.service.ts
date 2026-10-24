import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import QRCode from 'qrcode';
import { hashPassword, verifyPassword, type User } from '@tli/db';
import {
  checkPassword,
  requiresMfa,
  type AuthNextStep,
  type ChangePasswordInput,
  type LoginInput,
  type MeResponse,
  type MfaSetupResponse,
  type MfaVerifyInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { AuthContext, RequestMeta } from '../common/auth-context';
import { SessionService, permissionsOf } from './session.service';
import { computeNextStep } from './next-step';
import { isLocked, lockUntilAfterFailure } from './lockout';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpKeyUri,
  verifyTotp,
} from './mfa-crypto';

const GENERIC_LOGIN_ERROR =
  'No pudimos iniciar sesión. Revisá tus datos o, si fallaste varias veces, esperá unos minutos.';

export type IssuedSession = { token: string; next: AuthNextStep };

@Injectable()
export class AuthService implements OnModuleInit {
  // Hash de relleno: igualar tiempos de respuesta cuando el usuario no existe.
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword('relleno-para-igualar-tiempos');
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.sessions.findUserWithPermissions({ email: input.email });
    const now = new Date();

    if (!user || user.status !== 'ACTIVE' || isLocked(user.lockedUntil, now)) {
      await verifyPassword(this.dummyHash, input.password);
      await this.audit.log({
        action: 'auth.login.failure',
        actorId: user?.id ?? null,
        ip: meta.ip,
        metadata: {
          reason: !user ? 'unknown_user' : user.status !== 'ACTIVE' ? 'disabled' : 'locked',
        },
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      await this.registerFailure(user, meta, 'password');
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const permissions = permissionsOf(user);
    const mfaRequired = requiresMfa(permissions);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    const { token, sessionId } = await this.sessions.create(user, mfaRequired, meta);
    await this.audit.log({
      action: 'auth.login.success',
      actorId: user.id,
      entityType: 'session',
      entityId: sessionId,
      ip: meta.ip,
    });
    return {
      token,
      next: computeNextStep({
        mfaRequired,
        mfaEnabled: user.mfaEnabledAt !== null,
        sessionMfaVerified: false,
        mustChangePassword: user.mustChangePassword,
      }),
    };
  }

  /** Suma un fallo y bloquea la cuenta si corresponde. Al bloquear revoca todas sus sesiones. */
  private async registerFailure(
    user: Pick<User, 'id'>,
    meta: RequestMeta,
    kind: 'password' | 'mfa' | 'current_password',
  ): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    await this.audit.log({
      action: kind === 'mfa' ? 'auth.mfa.failure' : 'auth.login.failure',
      actorId: user.id,
      ip: meta.ip,
      metadata: { reason: kind, failedCount: updated.failedLoginCount },
    });
    const lockedUntil = lockUntilAfterFailure(updated.failedLoginCount, new Date());
    if (lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { lockedUntil } });
      await this.sessions.revokeAllForUser(user.id);
      await this.audit.log({
        action: 'auth.login.locked',
        actorId: user.id,
        ip: meta.ip,
        metadata: { lockedUntil: lockedUntil.toISOString(), failedCount: updated.failedLoginCount },
      });
    }
  }

  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    await this.audit.log({
      action: 'auth.logout',
      actorId: auth.user.id,
      entityType: 'session',
      entityId: auth.sessionId,
      ip: meta.ip,
    });
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      include: { roles: { include: { role: { select: { key: true, name: true } } } } },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role),
      permissions: [...auth.permissions].sort(),
      mfaRequired: auth.mfaRequired,
      mfaEnabled: user.mfaEnabledAt !== null,
      next: auth.next,
    };
  }

  async startMfaSetup(auth: AuthContext): Promise<MfaSetupResponse> {
    if (auth.next !== 'MFA_SETUP') {
      throw new ConflictException('El MFA ya está configurado o falta completar otro paso');
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: auth.user.id },
      data: { mfaPendingSecretEnc: encryptSecret(secret, this.config.mfa.encryptionKey) },
    });
    const otpauthUrl = totpKeyUri(auth.user.email, this.config.mfa.issuer, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    return { otpauthUrl, qrDataUrl, secret };
  }

  async confirmMfaSetup(
    auth: AuthContext,
    code: string,
    meta: RequestMeta,
  ): Promise<{ token: string; recoveryCodes: string[] }> {
    if (auth.next !== 'MFA_SETUP') {
      throw new ConflictException('El MFA ya está configurado o falta completar otro paso');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!user.mfaPendingSecretEnc) {
      throw new BadRequestException('Primero generá el código QR');
    }
    const secret = decryptSecret(user.mfaPendingSecretEnc, this.config.mfa.encryptionKey);
    const step = verifyTotp(code, secret, null);
    if (step === null) {
      throw new BadRequestException(
        'El código no es correcto. Revisá la hora del celular y probá de nuevo.',
      );
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          mfaSecretEnc: user.mfaPendingSecretEnc,
          mfaPendingSecretEnc: null,
          mfaEnabledAt: new Date(),
          mfaLastUsedStep: step,
        },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })),
      });
      await this.audit.log({ action: 'auth.mfa.enabled', actorId: user.id, ip: meta.ip }, tx);
    });
    const token = await this.sessions.rotate(auth.sessionId, { mfaVerified: true });
    return { token, recoveryCodes };
  }

  async verifyMfa(auth: AuthContext, input: MfaVerifyInput, meta: RequestMeta): Promise<string> {
    if (auth.next !== 'MFA_VERIFY') {
      throw new ConflictException('Esta sesión no tiene una verificación MFA pendiente');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!user.mfaSecretEnc) throw new ConflictException('El MFA no está configurado');

    if ('code' in input) {
      const secret = decryptSecret(user.mfaSecretEnc, this.config.mfa.encryptionKey);
      const step = verifyTotp(input.code, secret, user.mfaLastUsedStep);
      if (step === null) {
        await this.registerFailure(user, meta, 'mfa');
        throw new UnauthorizedException('Código incorrecto');
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaLastUsedStep: step, failedLoginCount: 0 },
      });
      await this.audit.log({ action: 'auth.mfa.verified', actorId: user.id, ip: meta.ip });
    } else {
      const { count } = await this.prisma.mfaRecoveryCode.updateMany({
        where: { userId: user.id, codeHash: hashRecoveryCode(input.recoveryCode), usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) {
        await this.registerFailure(user, meta, 'mfa');
        throw new UnauthorizedException('Código de recuperación inválido o ya usado');
      }
      const remaining = await this.prisma.mfaRecoveryCode.count({
        where: { userId: user.id, usedAt: null },
      });
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0 } });
      await this.audit.log({
        action: 'auth.mfa.recovery_code_used',
        actorId: user.id,
        ip: meta.ip,
        metadata: { remaining },
      });
    }
    return this.sessions.rotate(auth.sessionId, { mfaVerified: true });
  }

  async changePassword(
    auth: AuthContext,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<string> {
    if (auth.next === 'MFA_VERIFY') {
      throw new ForbiddenException('Primero completá la verificación MFA');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      await this.registerFailure(user, meta, 'current_password');
      throw new BadRequestException({
        message: 'Datos inválidos',
        issues: [{ path: 'currentPassword', message: 'La contraseña actual no es correcta' }],
      });
    }
    const errors = checkPassword(input.newPassword, { email: user.email, fullName: user.fullName });
    if (input.newPassword === input.currentPassword) {
      errors.push('Tiene que ser distinta de la actual.');
    }
    if (errors.length) {
      throw new BadRequestException({
        message: 'La contraseña nueva no cumple la política',
        issues: errors.map((message) => ({ path: 'newPassword', message })),
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
        },
      });
      const revoked = await this.sessions.revokeAllForUser(user.id, auth.sessionId, tx);
      await this.audit.log(
        {
          action: 'auth.password.changed',
          actorId: user.id,
          ip: meta.ip,
          metadata: { otherSessionsRevoked: revoked },
        },
        tx,
      );
    });
    return this.sessions.rotate(auth.sessionId);
  }

  async revokeOwnSession(auth: AuthContext, sessionId: string, meta: RequestMeta): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: auth.user.id },
    });
    if (!session) throw new BadRequestException('Sesión inexistente');
    await this.sessions.revoke(session.id);
    await this.audit.log({
      action: 'auth.session.revoked',
      actorId: auth.user.id,
      entityType: 'session',
      entityId: session.id,
      ip: meta.ip,
    });
  }
}
