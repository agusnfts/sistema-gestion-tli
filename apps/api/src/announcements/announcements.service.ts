import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  buildAnnouncementEmail,
  formatAnnouncementCode,
  formatWindow,
  isAnnouncementOpen,
  type AnnouncementDetail,
  type AnnouncementListItem,
  type AnnouncementRecipients,
  type AnnouncementSendKind,
  type CancelAnnouncementInput,
  type CloseAnnouncementInput,
  type CreateAnnouncementInput,
  type ListAnnouncementsQuery,
  type Paginated,
  type SendAnnouncementResponse,
  type UpcomingAnnouncement,
  type UpdateAnnouncementInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobRegistry, QueueService } from '../queue/queue.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const userRef = { select: { id: true, fullName: true } } as const;
const named = { select: { id: true, name: true } } as const;
const detailInclude = {
  createdBy: userRef,
  distributionLists: { select: { id: true, name: true, emails: true, active: true } },
  warehouses: named,
  areas: named,
  sends: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.UpdateAnnouncementInclude;

type AnnouncementRow = Prisma.UpdateAnnouncementGetPayload<{ include: typeof detailInclude }>;

const HOUR = 3_600_000;
/** Ventana del cartel de "próximas actualizaciones". */
const UPCOMING_DAYS = 7;
/** Sin hora de fin, una actualización avisada se muestra "en curso" hasta 12 h después. */
const OPEN_ENDED_HOURS = 12;

const ids = (list?: string[]) => list?.map((id) => ({ id }));

@Injectable()
export class AnnouncementsService implements OnModuleInit {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
    private readonly jobs: JobRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.jobs.register('announcements.reminders', () => this.sendDueReminders());
  }

  private toListItem(a: {
    id: string;
    number: number;
    title: string;
    systems: AnnouncementListItem['systems'];
    impact: AnnouncementListItem['impact'];
    status: AnnouncementListItem['status'];
    startsAt: Date;
    endsAt: Date | null;
    sentAt: Date | null;
  }): AnnouncementListItem {
    return {
      id: a.id,
      code: formatAnnouncementCode(a.number),
      title: a.title,
      systems: a.systems,
      impact: a.impact,
      status: a.status,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() ?? null,
      sentAt: a.sentAt?.toISOString() ?? null,
    };
  }

  async list(q: ListAnnouncementsQuery): Promise<Paginated<AnnouncementListItem>> {
    const where: Prisma.UpdateAnnouncementWhereInput = {
      systems: q.system ? { has: q.system } : undefined,
      status:
        q.state === 'open'
          ? { in: ['DRAFT', 'SCHEDULED'] }
          : q.state === 'closed'
            ? { in: ['DONE', 'CANCELLED'] }
            : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.updateAnnouncement.count({ where }),
      this.prisma.updateAnnouncement.findMany({
        where,
        // Abiertas: la más próxima primero. Cerradas: la más reciente primero.
        orderBy: { startsAt: q.state === 'open' ? 'asc' : 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => this.toListItem(r)),
    };
  }

  /** Actualizaciones ya avisadas, en curso o en los próximos días (cartel para todos). */
  async upcoming(): Promise<UpcomingAnnouncement[]> {
    const now = Date.now();
    const rows = await this.prisma.updateAnnouncement.findMany({
      where: {
        status: 'SCHEDULED',
        startsAt: { lte: new Date(now + UPCOMING_DAYS * 24 * HOUR) },
        OR: [
          { endsAt: { gte: new Date(now) } },
          { endsAt: null, startsAt: { gte: new Date(now - OPEN_ENDED_HOURS * HOUR) } },
        ],
      },
      orderBy: { startsAt: 'asc' },
      take: 5,
    });
    return rows.map((a) => ({
      id: a.id,
      code: formatAnnouncementCode(a.number),
      title: a.title,
      systems: a.systems,
      impact: a.impact,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() ?? null,
      inProgress: a.startsAt.getTime() <= now,
    }));
  }

  private async load(id: string): Promise<AnnouncementRow> {
    const a = await this.prisma.updateAnnouncement.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!a) throw new NotFoundException('Aviso inexistente');
    return a;
  }

  /** Destinatarios: mails de las listas activas + usuarios activos de los depósitos y áreas. */
  private async resolveRecipients(a: AnnouncementRow): Promise<{
    emails: string[];
    userIds: string[];
  }> {
    const warehouseIds = a.warehouses.map((w) => w.id);
    const areaIds = a.areas.map((x) => x.id);
    const users =
      warehouseIds.length || areaIds.length
        ? await this.prisma.user.findMany({
            where: {
              status: 'ACTIVE',
              anonymizedAt: null,
              OR: [
                { defaultWarehouseId: { in: warehouseIds } },
                { defaultAreaId: { in: areaIds } },
              ],
            },
            select: { id: true, email: true },
          })
        : [];
    const emails = new Set(a.distributionLists.filter((l) => l.active).flatMap((l) => l.emails));
    for (const u of users) emails.add(u.email);
    return { emails: [...emails], userIds: users.map((u) => u.id) };
  }

  private async toDetail(a: AnnouncementRow): Promise<AnnouncementDetail> {
    const [recipients, systems, emailActive, senders] = await Promise.all([
      this.resolveRecipients(a),
      this.prisma.systemInfo.findMany({
        where: { key: { in: a.systems } },
        include: { provider: named },
      }),
      this.notifications.emailActive(),
      this.prisma.user.findMany({
        where: { id: { in: a.sends.map((s) => s.sentById).filter((x): x is string => !!x) } },
        select: { id: true, fullName: true },
      }),
    ]);
    const providerOf = new Map(systems.map((s) => [s.key, s.provider?.name ?? null]));
    const sender = new Map(senders.map((u) => [u.id, u]));
    return {
      ...this.toListItem(a),
      reason: a.reason,
      details: a.details,
      reminderHours: a.reminderHours,
      reminderSentAt: a.reminderSentAt?.toISOString() ?? null,
      closedAt: a.closedAt?.toISOString() ?? null,
      closingNote: a.closingNote,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
      providers: a.systems.map((system) => ({ system, provider: providerOf.get(system) ?? null })),
      distributionLists: a.distributionLists.map((l) => ({
        id: l.id,
        name: l.name,
        emailCount: l.active ? l.emails.length : 0,
      })),
      warehouses: a.warehouses,
      areas: a.areas,
      recipients: { emailCount: recipients.emails.length, userCount: recipients.userIds.length },
      sends: a.sends.map((s) => ({
        id: s.id,
        kind: s.kind,
        emailCount: s.emailCount,
        userCount: s.userCount,
        emailed: s.emailed,
        sentBy: s.sentById ? (sender.get(s.sentById) ?? null) : null,
        createdAt: s.createdAt.toISOString(),
      })),
      emailActive,
    };
  }

  async get(id: string): Promise<AnnouncementDetail> {
    return this.toDetail(await this.load(id));
  }

  async create(
    input: CreateAnnouncementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<AnnouncementDetail> {
    const a = await this.prisma.updateAnnouncement.create({
      data: {
        title: input.title,
        systems: input.systems,
        reason: input.reason,
        details: input.details ?? null,
        impact: input.impact,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        reminderHours: input.reminderHours ?? null,
        createdById: actor.user.id,
        distributionLists: { connect: ids(input.distributionListIds) },
        warehouses: { connect: ids(input.warehouseIds) },
        areas: { connect: ids(input.areaIds) },
      },
      include: detailInclude,
    });
    await this.audit.log({
      action: 'announcement.created',
      actorId: actor.user.id,
      entityType: 'announcement',
      entityId: a.id,
      ip: meta.ip,
      metadata: { number: a.number, systems: a.systems },
    });
    return this.toDetail(a);
  }

  async update(
    id: string,
    input: UpdateAnnouncementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<AnnouncementDetail> {
    const current = await this.load(id);
    if (!isAnnouncementOpen(current.status)) {
      throw new BadRequestException('Una actualización realizada o cancelada no se puede editar');
    }
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt;
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('El fin tiene que ser posterior al inicio');
    }
    const rescheduled =
      input.startsAt !== undefined && input.startsAt.getTime() !== current.startsAt.getTime();
    const a = await this.prisma.updateAnnouncement.update({
      where: { id },
      data: {
        title: input.title,
        systems: input.systems,
        reason: input.reason,
        details: input.details,
        impact: input.impact,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reminderHours: input.reminderHours,
        // Si cambia el horario, el recordatorio se vuelve a mandar con la hora nueva.
        reminderSentAt: rescheduled || input.reminderHours !== undefined ? null : undefined,
        distributionLists: input.distributionListIds
          ? { set: ids(input.distributionListIds) }
          : undefined,
        warehouses: input.warehouseIds ? { set: ids(input.warehouseIds) } : undefined,
        areas: input.areaIds ? { set: ids(input.areaIds) } : undefined,
      },
      include: detailInclude,
    });
    await this.audit.log({
      action: 'announcement.updated',
      actorId: actor.user.id,
      entityType: 'announcement',
      entityId: id,
      ip: meta.ip,
      metadata: { fields: Object.keys(input), rescheduled },
    });
    return this.toDetail(a);
  }

  /**
   * Envía el aviso (o lo reenvía, por ejemplo después de cambiar el horario). Los usuarios del
   * sistema lo ven además en la campana. Sin mail activo, queda registrado y solo va la campana.
   */
  async send(id: string, actor: AuthContext, meta: RequestMeta): Promise<SendAnnouncementResponse> {
    const current = await this.load(id);
    if (!isAnnouncementOpen(current.status)) {
      throw new BadRequestException('La actualización ya está cerrada');
    }
    const now = new Date();
    const reminderWindowPassed =
      current.reminderHours !== null &&
      current.startsAt.getTime() - current.reminderHours * HOUR <= now.getTime();
    const a = await this.prisma.updateAnnouncement.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        sentAt: now,
        // Si el aviso sale ya dentro de la ventana del recordatorio, no se manda otro.
        reminderSentAt: reminderWindowPassed ? now : null,
      },
      include: detailInclude,
    });
    const result = await this.dispatch(a, 'NOTICE', actor.user.id, { requireRecipients: true });
    await this.audit.log({
      action: 'announcement.sent',
      actorId: actor.user.id,
      entityType: 'announcement',
      entityId: id,
      ip: meta.ip,
      metadata: { kind: 'NOTICE', ...result },
    });
    return { ...result, announcement: await this.get(id) };
  }

  async complete(
    id: string,
    input: CloseAnnouncementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<AnnouncementDetail> {
    return this.close(id, 'DONE', input, actor, meta);
  }

  async cancel(
    id: string,
    input: CancelAnnouncementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<AnnouncementDetail> {
    return this.close(id, 'CANCELLED', input, actor, meta);
  }

  private async close(
    id: string,
    status: 'DONE' | 'CANCELLED',
    input: CloseAnnouncementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<AnnouncementDetail> {
    const current = await this.load(id);
    if (!isAnnouncementOpen(current.status)) {
      throw new BadRequestException('La actualización ya está cerrada');
    }
    const a = await this.prisma.updateAnnouncement.update({
      where: { id },
      data: { status, closedAt: new Date(), closingNote: input.note || null },
      include: detailInclude,
    });
    // Solo se avisa el cierre a quienes recibieron el aviso.
    const notified = input.notify && current.sentAt !== null;
    const result = notified
      ? await this.dispatch(a, status, actor.user.id, { requireRecipients: false })
      : null;
    await this.audit.log({
      action: 'announcement.closed',
      actorId: actor.user.id,
      entityType: 'announcement',
      entityId: id,
      ip: meta.ip,
      metadata: { status, notified, ...(result ?? {}) },
    });
    return this.get(id);
  }

  /** Recordatorios automáticos (job periódico del worker). */
  async sendDueReminders(): Promise<void> {
    const now = Date.now();
    const candidates = await this.prisma.updateAnnouncement.findMany({
      where: {
        status: 'SCHEDULED',
        reminderHours: { not: null },
        reminderSentAt: null,
        startsAt: { gt: new Date(now) },
      },
      select: { id: true, number: true, startsAt: true, reminderHours: true },
    });
    for (const c of candidates) {
      if (c.startsAt.getTime() - c.reminderHours! * HOUR > now) continue;
      // Marca primero (condicional) para no mandar dos veces si corren dos workers.
      const claimed = await this.prisma.updateAnnouncement.updateMany({
        where: { id: c.id, reminderSentAt: null, status: 'SCHEDULED' },
        data: { reminderSentAt: new Date() },
      });
      if (claimed.count === 0) continue;
      await this.dispatch(await this.load(c.id), 'REMINDER', null, { requireRecipients: false });
      this.logger.log(`Recordatorio enviado: ${formatAnnouncementCode(c.number)}`);
    }
  }

  /** Arma y encola los mails y deja el aviso en la campana de los usuarios del sistema. */
  private async dispatch(
    a: AnnouncementRow,
    kind: AnnouncementSendKind,
    actorId: string | null,
    opts: { requireRecipients: boolean },
  ): Promise<AnnouncementRecipients & { emailed: boolean }> {
    const recipients = await this.resolveRecipients(a);
    if (opts.requireRecipients && recipients.emails.length === 0) {
      throw new BadRequestException(
        'El aviso no tiene destinatarios: elegí al menos una lista, un depósito o un área',
      );
    }
    const emailed = recipients.emails.length > 0 && (await this.notifications.emailActive());
    if (emailed) {
      const mail = buildAnnouncementEmail(a, kind, this.config.appOrigin);
      // Un mail por destinatario: nadie ve las direcciones de los demás.
      for (const to of recipients.emails) {
        await this.queue.add('email.send', { to, ...mail });
      }
    }
    if (recipients.userIds.length) {
      const title = buildAnnouncementEmail(a, kind, this.config.appOrigin).subject.replace(
        /^\[TLI\] /,
        '',
      );
      await this.prisma.notification.createMany({
        data: recipients.userIds.map((userId) => ({
          userId,
          kind: 'SYSTEM_UPDATE',
          title,
          body: `${formatWindow(a.startsAt, a.endsAt)}. ${a.title}`,
          entityType: 'announcement',
          entityId: a.id,
        })),
      });
    }
    await this.prisma.announcementSend.create({
      data: {
        announcementId: a.id,
        kind,
        emailCount: emailed ? recipients.emails.length : 0,
        userCount: recipients.userIds.length,
        emailed,
        sentById: actorId,
      },
    });
    return { emailCount: recipients.emails.length, userCount: recipients.userIds.length, emailed };
  }
}
