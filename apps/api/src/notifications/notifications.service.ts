import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@tli/db';
import type { NotificationItem, NotificationKind, PermissionKey } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { JobRegistry, QueueService } from '../queue/queue.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { EMAIL_SENDER, type EmailSender } from './email-sender';

export type NotificationInput = {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
};

/**
 * Notificaciones dentro del sistema (campana), siempre. Además, si el Admin habilitó el mail
 * y hay SMTP configurado, cada aviso se encola como mail para el worker.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly queue: QueueService,
    private readonly jobs: JobRegistry,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.jobs.register('email.send', async (data) => {
      await this.email.send({
        to: String(data.to),
        subject: String(data.subject),
        text: String(data.text),
      });
    });
  }

  /** El mail sale solo si el Admin lo habilitó y hay un servidor SMTP configurado. */
  async emailActive(): Promise<boolean> {
    return this.email.configured && (await this.settings.getEmailSettings()).enabled;
  }

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
    if (await this.emailActive()) await this.enqueueEmails(recipients, input);
  }

  private async enqueueEmails(userIds: string[], input: NotificationInput): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, status: 'ACTIVE', anonymizedAt: null },
      select: { email: true },
    });
    const url = input.link ? `${this.config.appOrigin}${input.link}` : this.config.appOrigin;
    // Solo título, resumen y link: el detalle se ve dentro del sistema (minimización de datos).
    const text = [input.body, '', `Ver en el sistema: ${url}`]
      .filter((l) => l !== undefined)
      .join('\n');
    for (const u of users) {
      await this.queue.add('email.send', { to: u.email, subject: `[TLI] ${input.title}`, text });
    }
  }

  /** Mail de prueba desde Configuración (directo, sin cola, para ver el error si falla). */
  async sendTestEmail(to: string): Promise<void> {
    await this.email.send({
      to,
      subject: '[TLI] Mail de prueba',
      text: 'Si recibiste este mail, el envío desde el Sistema de Gestión TLI funciona.',
    });
  }

  get emailConfigured(): boolean {
    return this.email.configured;
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
