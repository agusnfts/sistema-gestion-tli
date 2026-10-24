import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type User } from '@tli/db';
import { isPermissionKey, requiresMfa, type PermissionKey, type SessionInfo } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { AuthContext, RequestMeta } from '../common/auth-context';
import { computeNextStep } from './next-step';

const userWithPermissions = {
  roles: { include: { role: { include: { permissions: { select: { permissionKey: true } } } } } },
} satisfies Prisma.UserInclude;

export type UserWithPermissions = Prisma.UserGetPayload<{ include: typeof userWithPermissions }>;

export function permissionsOf(user: UserWithPermissions): Set<PermissionKey> {
  const set = new Set<PermissionKey>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) {
      if (isPermissionKey(rp.permissionKey)) set.add(rp.permissionKey);
    }
  }
  return set;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Evita escribir en cada request: lastSeenAt se actualiza como mucho una vez por minuto.
const TOUCH_INTERVAL_MS = 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  findUserWithPermissions(where: Prisma.UserWhereUniqueInput): Promise<UserWithPermissions | null> {
    return this.prisma.user.findUnique({ where, include: userWithPermissions });
  }

  private lifetimes(privileged: boolean) {
    return privileged ? this.config.session.privileged : this.config.session.standard;
  }

  async create(
    user: Pick<User, 'id'>,
    privileged: boolean,
    meta: RequestMeta,
  ): Promise<{ token: string; sessionId: string }> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const life = this.lifetimes(privileged);
    const session = await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        idleExpiresAt: new Date(now + life.idleMinutes * 60_000),
        expiresAt: new Date(now + life.absoluteMinutes * 60_000),
      },
    });
    return { token, sessionId: session.id };
  }

  /** Resuelve el token de la cookie a un AuthContext, o null si la sesión no es válida. */
  async resolve(token: string): Promise<AuthContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: userWithPermissions } },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      return null;
    }
    const permissions = permissionsOf(session.user);
    const mfaRequired = requiresMfa(permissions);

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      const life = this.lifetimes(mfaRequired);
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          idleExpiresAt: new Date(
            Math.min(now.getTime() + life.idleMinutes * 60_000, session.expiresAt.getTime()),
          ),
        },
      });
    }

    return {
      sessionId: session.id,
      user: { id: session.user.id, email: session.user.email, fullName: session.user.fullName },
      permissions,
      mfaRequired,
      next: computeNextStep({
        mfaRequired,
        mfaEnabled: session.user.mfaEnabledAt !== null,
        sessionMfaVerified: session.mfaVerified,
        mustChangePassword: session.user.mustChangePassword,
      }),
    };
  }

  /** Emite un token nuevo para la misma sesión (anti session fixation). */
  async rotate(sessionId: string, data: { mfaVerified?: boolean } = {}): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { tokenHash: hashToken(token), ...data },
    });
    return token;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(
    userId: string,
    exceptSessionId?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const { count } = await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: exceptSessionId ? { not: exceptSessionId } : undefined,
      },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async listActive(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
    const now = new Date();
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, idleExpiresAt: { gt: now } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      ip: s.ip,
      userAgent: s.userAgent,
      current: s.id === currentSessionId,
    }));
  }
}
