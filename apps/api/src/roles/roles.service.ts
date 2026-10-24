import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  isPermissionKey,
  type CreateRoleInput,
  type RoleItem,
  type UpdateRoleInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const roleInclude = {
  permissions: { select: { permissionKey: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function toItem(r: RoleRow): RoleItem {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissions: r.permissions
      .map((p) => p.permissionKey)
      .filter(isPermissionKey)
      .sort(),
    userCount: r._count.users,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleItem[]> {
    const roles = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toItem);
  }

  async create(input: CreateRoleInput, actor: AuthContext, meta: RequestMeta): Promise<RoleItem> {
    if (await this.prisma.role.findUnique({ where: { key: input.key } })) {
      throw new ConflictException('Ya existe un rol con esa clave');
    }
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          permissions: {
            create: [...new Set(input.permissions)].map((permissionKey) => ({ permissionKey })),
          },
        },
        include: roleInclude,
      });
      await this.audit.log(
        {
          action: 'role.created',
          actorId: actor.user.id,
          entityType: 'role',
          entityId: role.id,
          ip: meta.ip,
          metadata: { key: role.key, permissions: input.permissions },
        },
        tx,
      );
      return toItem(role);
    });
  }

  async update(
    id: string,
    input: UpdateRoleInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<RoleItem> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw new NotFoundException('Rol inexistente');
    if (role.isSystem) {
      throw new BadRequestException('Los roles de sistema se definen en el código y no se editan');
    }
    const before = toItem(role).permissions;
    return this.prisma.$transaction(async (tx) => {
      if (input.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: [...new Set(input.permissions)].map((permissionKey) => ({
            roleId: id,
            permissionKey,
          })),
        });
      }
      const updated = await tx.role.update({
        where: { id },
        data: { name: input.name, description: input.description },
        include: roleInclude,
      });
      await this.audit.log(
        {
          action: 'role.updated',
          actorId: actor.user.id,
          entityType: 'role',
          entityId: id,
          ip: meta.ip,
          metadata: input.permissions
            ? { permissionsFrom: before, permissionsTo: toItem(updated).permissions }
            : {},
        },
        tx,
      );
      return toItem(updated);
    });
  }

  async remove(id: string, actor: AuthContext, meta: RequestMeta): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw new NotFoundException('Rol inexistente');
    if (role.isSystem) throw new BadRequestException('Los roles de sistema no se pueden eliminar');
    if (role._count.users > 0) {
      throw new BadRequestException(
        'El rol tiene usuarios asignados. Quitáselo antes de eliminarlo.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'role.deleted',
          actorId: actor.user.id,
          entityType: 'role',
          entityId: id,
          ip: meta.ip,
          metadata: { key: role.key },
        },
        tx,
      );
    });
  }
}
