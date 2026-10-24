import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateTemporaryPassword, hashPassword, Prisma } from '@tli/db';
import {
  SYSTEM_ROLE_KEYS,
  type CreateUserInput,
  type ListUsersQuery,
  type Paginated,
  type TemporaryPasswordResponse,
  type UpdateUserInput,
  type UserListItem,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const userListInclude = {
  roles: { include: { role: { select: { id: true, key: true, name: true } } } },
  defaultArea: { select: { id: true, name: true } },
  defaultWarehouse: { select: { id: true, name: true } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userListInclude }>;

function toListItem(u: UserRow): UserListItem {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    roles: u.roles.map((r) => r.role),
    defaultArea: u.defaultArea,
    defaultWarehouse: u.defaultWarehouse,
    mfaEnabled: u.mfaEnabledAt !== null,
    locked: u.lockedUntil !== null && u.lockedUntil > new Date(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async list(q: ListUsersQuery): Promise<Paginated<UserListItem>> {
    const where: Prisma.UserWhereInput = {
      anonymizedAt: null,
      status: q.status,
      OR: q.q
        ? [
            { email: { contains: q.q, mode: 'insensitive' } },
            { fullName: { contains: q.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userListInclude,
        orderBy: { fullName: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: rows.map(toListItem) };
  }

  async get(id: string): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userListInclude });
    if (!user || user.anonymizedAt) throw new NotFoundException('Usuario inexistente');
    return toListItem(user);
  }

  async create(
    input: CreateUserInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<TemporaryPasswordResponse> {
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    const roleKeys = await this.resolveRoleKeys(input.roleIds);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          mustChangePassword: true,
          defaultAreaId: input.defaultAreaId ?? null,
          defaultWarehouseId: input.defaultWarehouseId ?? null,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        include: userListInclude,
      });
      await this.audit.log(
        {
          action: 'user.created',
          actorId: actor.user.id,
          entityType: 'user',
          entityId: created.id,
          ip: meta.ip,
          metadata: { roles: roleKeys },
        },
        tx,
      );
      return created;
    });
    return { user: toListItem(user), temporaryPassword };
  }

  async update(
    id: string,
    input: UpdateUserInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<UserListItem> {
    const current = await this.prisma.user.findUnique({ where: { id }, include: userListInclude });
    if (!current || current.anonymizedAt) throw new NotFoundException('Usuario inexistente');
    const isSelf = id === actor.user.id;

    if (isSelf && input.status === 'DISABLED') {
      throw new BadRequestException('No podés deshabilitar tu propio usuario');
    }
    const newRoleKeys = input.roleIds ? await this.resolveRoleKeys(input.roleIds) : null;
    const oldRoleKeys = current.roles.map((r) => r.role.key).sort();
    const rolesChanged = newRoleKeys !== null && newRoleKeys.join() !== oldRoleKeys.join();
    if (
      isSelf &&
      rolesChanged &&
      !newRoleKeys.includes(SYSTEM_ROLE_KEYS.ADMIN) &&
      oldRoleKeys.includes(SYSTEM_ROLE_KEYS.ADMIN)
    ) {
      throw new BadRequestException('No podés quitarte el rol Admin a vos mismo');
    }
    const losesAdmin =
      oldRoleKeys.includes(SYSTEM_ROLE_KEYS.ADMIN) &&
      ((rolesChanged && !newRoleKeys.includes(SYSTEM_ROLE_KEYS.ADMIN)) ||
        input.status === 'DISABLED');
    if (losesAdmin && current.status === 'ACTIVE') await this.assertAnotherActiveAdmin(id);

    const statusChanged = input.status !== undefined && input.status !== current.status;
    const changedFields = (['fullName', 'defaultAreaId', 'defaultWarehouseId'] as const).filter(
      (f) => input[f] !== undefined && input[f] !== current[f],
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (rolesChanged) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: input.roleIds!.map((roleId) => ({ userId: id, roleId })),
        });
      }
      const user = await tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName,
          defaultAreaId: input.defaultAreaId,
          defaultWarehouseId: input.defaultWarehouseId,
          status: input.status,
        },
        include: userListInclude,
      });
      // Cambios de permisos o deshabilitación: se cierran todas sus sesiones.
      if (rolesChanged || (statusChanged && input.status === 'DISABLED')) {
        await this.sessions.revokeAllForUser(id, undefined, tx);
      }
      const base = { actorId: actor.user.id, entityType: 'user', entityId: id, ip: meta.ip };
      if (changedFields.length) {
        await this.audit.log(
          { ...base, action: 'user.updated', metadata: { fields: changedFields } },
          tx,
        );
      }
      if (rolesChanged) {
        await this.audit.log(
          {
            ...base,
            action: 'user.roles.changed',
            metadata: { from: oldRoleKeys, to: newRoleKeys },
          },
          tx,
        );
      }
      if (statusChanged) {
        await this.audit.log(
          { ...base, action: input.status === 'DISABLED' ? 'user.disabled' : 'user.enabled' },
          tx,
        );
      }
      return user;
    });
    return toListItem(updated);
  }

  async resetPassword(
    id: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<TemporaryPasswordResponse> {
    await this.get(id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
        include: userListInclude,
      });
      await this.sessions.revokeAllForUser(id, undefined, tx);
      await this.audit.log(
        {
          action: 'user.password.reset',
          actorId: actor.user.id,
          entityType: 'user',
          entityId: id,
          ip: meta.ip,
        },
        tx,
      );
      return u;
    });
    return { user: toListItem(user), temporaryPassword };
  }

  async resetMfa(id: string, actor: AuthContext, meta: RequestMeta): Promise<UserListItem> {
    await this.get(id);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          mfaSecretEnc: null,
          mfaPendingSecretEnc: null,
          mfaEnabledAt: null,
          mfaLastUsedStep: null,
        },
        include: userListInclude,
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: id } });
      await this.sessions.revokeAllForUser(id, undefined, tx);
      await this.audit.log(
        {
          action: 'user.mfa.reset',
          actorId: actor.user.id,
          entityType: 'user',
          entityId: id,
          ip: meta.ip,
        },
        tx,
      );
      return u;
    });
    return toListItem(user);
  }

  async unlock(id: string, actor: AuthContext, meta: RequestMeta): Promise<UserListItem> {
    await this.get(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
      include: userListInclude,
    });
    await this.audit.log({
      action: 'user.unlocked',
      actorId: actor.user.id,
      entityType: 'user',
      entityId: id,
      ip: meta.ip,
    });
    return toListItem(user);
  }

  private async resolveRoleKeys(roleIds: string[]): Promise<string[]> {
    const unique = [...new Set(roleIds)];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: unique } },
      select: { key: true },
    });
    if (roles.length !== unique.length) throw new BadRequestException('Algún rol no existe');
    return roles.map((r) => r.key).sort();
  }

  private async assertAnotherActiveAdmin(excludeUserId: string): Promise<void> {
    const count = await this.prisma.user.count({
      where: {
        id: { not: excludeUserId },
        status: 'ACTIVE',
        roles: { some: { role: { key: SYSTEM_ROLE_KEYS.ADMIN } } },
      },
    });
    if (count === 0) throw new BadRequestException('Tiene que quedar al menos un Admin activo');
  }
}
