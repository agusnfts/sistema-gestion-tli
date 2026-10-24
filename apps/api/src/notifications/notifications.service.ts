import { Injectable } from '@nestjs/common';
import { Prisma } from '@tli/db';
import type { NotificationItem, NotificationKind, PermissionKey } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationInput = {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
};

/**
 * Notificaciones dentro del sistema (campana). El envío por mail (EmailSender,
 * apagado por defecto) se suma como otro canal en la Fase 2b sin cambiar a quienes llaman.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifica a cada usuario una vez. `exclude` evita avisarle a quien hizo la acción. */
  async notify(
    userIds: Iterable<string | null | undefined>,
    input: NotificationInput,
    opts: { exclude?: string; tx?: Prisma.TransactionClient } = {},
  ): Promise<void> {
    const recipients = [
      ...new Set([...userIds].filter((id): id is string => !!id && id !== opts.exclude)),
    ];
    if (!recipients.length) return;
    await (opts.tx ?? this.prisma).notification.createMany({
      data: recipients.map((userId) => ({ userId, ...input })),
    });
  }

  /** Usuarios activos que tienen un permiso (por cualquiera de sus roles). */
  async usersWithPermission(permission: PermissionKey): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { permissions: { some: { permissionKey: permission } } } } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async list(userId: string, unreadOnly: boolean): Promise<NotificationItem[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, readAt: unreadOnly ? null : undefined },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((n) => ({
      id: n.id,
      kind: n.kind as NotificationKind,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
