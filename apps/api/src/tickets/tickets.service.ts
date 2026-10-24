import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  computeDueDates,
  fixedCategoryFor,
  isCategoryAllowed,
  formatTicketNumber,
  localDateKey,
  MANUAL_TRANSITIONS,
  OPEN_STATUSES,
  parseTicketNumber,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type AddCommentInput,
  type AddTimeEntryInput,
  type ChangeTicketStatusInput,
  type CreateTicketInput,
  type CreateTicketResponse,
  type ListTicketsQuery,
  type Paginated,
  type TicketDetail,
  type TicketListItem,
  type TicketStatus,
  type UpdateTicketInput,
  type UserRef,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';
import {
  priorityChangePatch,
  slaSnapshot,
  statusTransitionPatch,
  type SlaContext,
} from './ticket-sla';

const userRef = { select: { id: true, fullName: true } } as const;

const listInclude = {
  requester: userRef,
  assignee: userRef,
  warehouse: { select: { id: true, name: true } },
  area: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof listInclude }>;

const link = (id: string) => `/tickets/${id}`;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async slaContext(): Promise<SlaContext> {
    const [calendar, policies] = await Promise.all([
      this.settings.getCalendar(),
      this.settings.getSlaPolicies(),
    ]);
    return { calendar, policies };
  }

  private toListItem(t: TicketRow, ctx: SlaContext, now: Date): TicketListItem {
    return {
      id: t.id,
      number: formatTicketNumber(t.number),
      type: t.type,
      category: t.category,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      priorityIsProvisional: t.priorityIsProvisional,
      requester: t.requester,
      assignee: t.assignee,
      warehouse: t.warehouse,
      area: t.area,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      sla: slaSnapshot(t, now, ctx),
    };
  }

  // --- Alta ------------------------------------------------------------------

  async create(
    input: CreateTicketInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<CreateTicketResponse> {
    const ctx = await this.slaContext();
    const now = new Date();
    const due = computeDueDates({
      createdAt: now,
      type: input.type,
      priority: input.userUrgency,
      pausedMinutes: 0,
      policies: ctx.policies,
      calendar: ctx.calendar,
    });

    const ticket = await this.prisma.$transaction(async (tx) => {
      const t = await tx.ticket.create({
        data: {
          type: input.type,
          category: input.category,
          subject: input.subject,
          description: input.description,
          requesterId: actor.user.id,
          // Sector afectado: lo elige el usuario (depósito, área o ninguno).
          warehouseId: input.warehouseId ?? null,
          areaId: input.areaId ?? null,
          userUrgency: input.userUrgency,
          // Hasta que IT la defina, la prioridad es la urgencia que indicó el usuario.
          priority: input.userUrgency,
          extraFields: input.extra as Prisma.InputJsonValue,
          createdAt: now,
          firstResponseDueAt: due.firstResponseDueAt,
          resolutionDueAt: due.resolutionDueAt,
        },
      });
      await tx.activityEvent.create({
        data: {
          entityType: 'ticket',
          entityId: t.id,
          actorId: actor.user.id,
          kind: 'CREATED',
          visibility: 'PUBLIC',
        },
      });
      await this.audit.log(
        {
          action: 'ticket.created',
          actorId: actor.user.id,
          entityType: 'ticket',
          entityId: t.id,
          ip: meta.ip,
          metadata: { number: t.number, type: t.type },
        },
        tx,
      );
      return t;
    });

    const number = formatTicketNumber(ticket.number);
    await this.notifications.notify(
      await this.notifications.usersWithPermission('ticket.manage'),
      {
        kind: 'TICKET_CREATED',
        title: `Nuevo ticket ${number}`,
        body: input.subject,
        link: link(ticket.id),
        entityType: 'ticket',
        entityId: ticket.id,
      },
      { exclude: actor.user.id },
    );
    return { id: ticket.id, number };
  }

  // --- Consulta --------------------------------------------------------------

  async list(q: ListTicketsQuery, actor: AuthContext): Promise<Paginated<TicketListItem>> {
    if (q.scope === 'all' && !actor.permissions.has('ticket.read.all')) {
      throw new ForbiddenException('No tenés permiso para ver todos los tickets');
    }
    const where: Prisma.TicketWhereInput = {
      requesterId: q.scope === 'mine' ? actor.user.id : undefined,
      type: q.type,
      priority: q.priority,
      category: q.category,
    };
    if (q.status) where.status = q.status;
    else if (q.state === 'open') where.status = { in: [...OPEN_STATUSES] };
    else if (q.state === 'resolved') where.status = 'RESOLVED';
    else if (q.state === 'closed')
      where.status = { in: ['CLOSED', 'DERIVED_TO_IMPROVEMENT', 'DERIVED_TO_INTEGRATION'] };

    if (q.assignee === 'me') where.assigneeId = actor.user.id;
    else if (q.assignee === 'none') where.assigneeId = null;
    else if (q.assignee) where.assigneeId = q.assignee;

    // Las marcas de riesgo/vencimiento las pone el monitor de SLA.
    if (q.sla === 'breached') {
      where.AND = [
        { status: { in: [...OPEN_STATUSES] } },
        {
          OR: [
            { firstResponseBreachAt: { not: null }, firstRespondedAt: null },
            { resolutionBreachAt: { not: null } },
          ],
        },
      ];
    } else if (q.sla === 'at_risk') {
      where.AND = [
        { status: { in: [...OPEN_STATUSES] } },
        {
          OR: [
            {
              firstResponseRiskAt: { not: null },
              firstResponseBreachAt: null,
              firstRespondedAt: null,
            },
            { resolutionRiskAt: { not: null }, resolutionBreachAt: null },
          ],
        },
      ];
    }

    if (q.q) {
      const number = parseTicketNumber(q.q);
      where.OR = [
        { subject: { contains: q.q, mode: 'insensitive' } },
        ...(number !== null ? [{ number }] : []),
      ];
    }

    const [total, rows, ctx] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.slaContext(),
    ]);
    const now = new Date();
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((t) => this.toListItem(t, ctx, now)),
    };
  }

  /** Carga un ticket que el actor puede ver. Si no puede, responde 404 (no revela que existe). */
  private async findVisible(id: string, actor: AuthContext) {
    const t = await this.prisma.ticket.findUnique({
      where: { id },
      include: listInclude,
    });
    if (!t || (t.requesterId !== actor.user.id && !actor.permissions.has('ticket.read.all'))) {
      throw new NotFoundException('Ticket inexistente');
    }
    return t;
  }

  async get(id: string, actor: AuthContext): Promise<TicketDetail> {
    const t = await this.findVisible(id, actor);
    const canManage = actor.permissions.has('ticket.manage');
    const seesInternal = actor.permissions.has('ticket.comment.internal');
    const seesTime = actor.permissions.has('ticket.time.log');
    const isRequester = t.requesterId === actor.user.id;

    const [comments, activity, timeEntries, ctx] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where: { ticketId: id, visibility: seesInternal ? undefined : 'PUBLIC' },
        include: { author: userRef },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.activityEvent.findMany({
        where: {
          entityType: 'ticket',
          entityId: id,
          visibility: seesInternal ? undefined : 'PUBLIC',
        },
        include: { actor: userRef },
        orderBy: { occurredAt: 'asc' },
      }),
      seesTime
        ? this.prisma.timeEntry.findMany({
            where: { ticketId: id },
            include: { user: userRef },
            orderBy: { workDate: 'desc' },
          })
        : Promise.resolve(null),
      this.slaContext(),
    ]);

    return {
      ...this.toListItem(t, ctx, new Date()),
      description: t.description,
      userUrgency: t.userUrgency,
      extraFields: (t.extraFields ?? {}) as Record<string, unknown>,
      firstRespondedAt: t.firstRespondedAt?.toISOString() ?? null,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      closedAt: t.closedAt?.toISOString() ?? null,
      resolutionCause: t.resolutionCause,
      resolutionSolution: t.resolutionSolution,
      comments: comments.map((c) => ({
        id: c.id,
        author: c.author,
        body: c.body,
        visibility: c.visibility,
        createdAt: c.createdAt.toISOString(),
        fromStaff: c.authorId !== t.requesterId,
      })),
      activity: activity.map((a) => ({
        id: a.id,
        kind: a.kind,
        field: a.field,
        oldValue: a.oldValue,
        newValue: a.newValue,
        actor: a.actor,
        occurredAt: a.occurredAt.toISOString(),
      })),
      timeEntries:
        timeEntries?.map((e) => ({
          id: e.id,
          user: e.user,
          minutes: e.minutes,
          workDate: e.workDate.toISOString().slice(0, 10),
          note: e.note,
        })) ?? null,
      totalMinutes: timeEntries ? timeEntries.reduce((s, e) => s + e.minutes, 0) : null,
      allowedTransitions: canManage ? [...MANUAL_TRANSITIONS[t.status]] : [],
      canComment:
        t.status !== 'CLOSED' &&
        (canManage || (isRequester && actor.permissions.has('ticket.comment.own'))),
      canManage,
    };
  }

  async assignees(): Promise<UserRef[]> {
    const ids = await this.notifications.usersWithPermission('ticket.manage');
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  // --- Gestión (IT) ----------------------------------------------------------

  async update(
    id: string,
    input: UpdateTicketInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<TicketDetail> {
    const t = await this.findVisible(id, actor);
    if (t.status === 'CLOSED') throw new BadRequestException('El ticket está cerrado');
    const now = new Date();
    const data: Prisma.TicketUncheckedUpdateInput = {};
    const events: Prisma.ActivityEventCreateManyInput[] = [];
    const base = { entityType: 'ticket', entityId: id, actorId: actor.user.id, occurredAt: now };
    let newAssignee: string | null | undefined;

    if (input.assigneeId !== undefined && input.assigneeId !== t.assigneeId) {
      if (input.assigneeId) {
        const staff = await this.notifications.usersWithPermission('ticket.manage');
        if (!staff.includes(input.assigneeId))
          throw new BadRequestException('El usuario no puede gestionar tickets');
      }
      data.assigneeId = input.assigneeId;
      newAssignee = input.assigneeId;
      events.push({
        ...base,
        kind: 'FIELD_CHANGED',
        field: 'assignee',
        oldValue: t.assignee?.fullName ?? null,
        newValue: input.assigneeId ?? null,
      });
      if (input.assigneeId && t.status === 'NEW') {
        data.status = 'ASSIGNED';
        events.push({
          ...base,
          kind: 'STATUS_CHANGED',
          field: 'status',
          oldValue: t.status,
          newValue: 'ASSIGNED',
          visibility: 'PUBLIC',
        });
      }
    }
    if (input.priority && (input.priority !== t.priority || t.priorityIsProvisional)) {
      Object.assign(data, priorityChangePatch(t, input.priority, now, await this.slaContext()), {
        priorityIsProvisional: false,
      });
      events.push({
        ...base,
        kind: 'FIELD_CHANGED',
        field: 'priority',
        oldValue: t.priority,
        newValue: input.priority,
        visibility: 'PUBLIC',
      });
    }
    if (input.category && input.category !== t.category) {
      if (fixedCategoryFor(t.type)) {
        throw new BadRequestException(
          'La categoría de un pedido de integración no se puede cambiar',
        );
      }
      if (!isCategoryAllowed(t.type, input.category)) {
        throw new BadRequestException('Esa categoría no corresponde a este tipo de ticket');
      }
      data.category = input.category;
      events.push({
        ...base,
        kind: 'FIELD_CHANGED',
        field: 'category',
        oldValue: t.category,
        newValue: input.category,
      });
    }
    if (!events.length) return this.get(id, actor);

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id }, data });
      await tx.activityEvent.createMany({ data: events });
      if (newAssignee !== undefined) {
        await this.audit.log(
          {
            action: 'ticket.assigned',
            actorId: actor.user.id,
            entityType: 'ticket',
            entityId: id,
            ip: meta.ip,
            metadata: { assigneeId: newAssignee },
          },
          tx,
        );
      }
      if (input.priority && data.priority) {
        await this.audit.log(
          {
            action: 'ticket.priority.changed',
            actorId: actor.user.id,
            entityType: 'ticket',
            entityId: id,
            ip: meta.ip,
            metadata: { from: t.priority, to: input.priority },
          },
          tx,
        );
      }
      if (data.status) {
        await this.audit.log(
          {
            action: 'ticket.status.changed',
            actorId: actor.user.id,
            entityType: 'ticket',
            entityId: id,
            ip: meta.ip,
            metadata: { from: t.status, to: data.status },
          },
          tx,
        );
      }
    });

    const number = formatTicketNumber(t.number);
    if (newAssignee) {
      await this.notifications.notify(
        [newAssignee],
        {
          kind: 'TICKET_ASSIGNED',
          title: `Te asignaron ${number}`,
          body: t.subject,
          link: link(id),
          entityType: 'ticket',
          entityId: id,
        },
        { exclude: actor.user.id },
      );
    }
    if (data.status === 'ASSIGNED') {
      await this.notifications.notify(
        [t.requesterId],
        {
          kind: 'TICKET_STATUS_CHANGED',
          title: `${number}: ${TICKET_STATUS_LABELS.ASSIGNED}`,
          body: 'Tu ticket ya tiene una persona de IT asignada.',
          link: link(id),
          entityType: 'ticket',
          entityId: id,
        },
        { exclude: actor.user.id },
      );
    }
    if (input.priority && data.priority) {
      await this.notifications.notify(
        [t.requesterId],
        {
          kind: 'TICKET_STATUS_CHANGED',
          title: `${number}: prioridad ${PRIORITY_LABELS[input.priority].toLowerCase()}`,
          link: link(id),
          entityType: 'ticket',
          entityId: id,
        },
        { exclude: actor.user.id },
      );
    }
    return this.get(id, actor);
  }

  async changeStatus(
    id: string,
    input: ChangeTicketStatusInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<TicketDetail> {
    const t = await this.findVisible(id, actor);
    if (!MANUAL_TRANSITIONS[t.status].includes(input.status)) {
      throw new BadRequestException(
        `No se puede pasar de "${TICKET_STATUS_LABELS[t.status]}" a "${TICKET_STATUS_LABELS[input.status]}"`,
      );
    }
    const extra: Prisma.TicketUncheckedUpdateInput = {};
    if (input.status === 'RESOLVED') {
      extra.resolutionCause = input.resolutionCause;
      extra.resolutionSolution = input.resolutionSolution;
    }
    if (input.status === 'CLOSED') extra.closeReason = 'MANUAL';
    await this.applyStatus(t, input.status, actor, meta, extra);
    return this.get(id, actor);
  }

  /** Aplica un cambio de estado con su efecto en el SLA, historial, auditoría y avisos. */
  private async applyStatus(
    t: Awaited<ReturnType<TicketsService['findVisible']>>,
    to: TicketStatus,
    actor: AuthContext,
    meta: RequestMeta,
    extra: Prisma.TicketUncheckedUpdateInput = {},
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const now = new Date();
    const patch = statusTransitionPatch(t, to, now, await this.slaContext());
    const run = async (db: Prisma.TransactionClient) => {
      await db.ticket.update({ where: { id: t.id }, data: { ...patch, ...extra } });
      await db.activityEvent.create({
        data: {
          entityType: 'ticket',
          entityId: t.id,
          actorId: actor.user.id,
          kind: 'STATUS_CHANGED',
          field: 'status',
          oldValue: t.status,
          newValue: to,
          visibility: 'PUBLIC',
          occurredAt: now,
        },
      });
      await this.audit.log(
        {
          action: 'ticket.status.changed',
          actorId: actor.user.id,
          entityType: 'ticket',
          entityId: t.id,
          ip: meta.ip,
          metadata: { from: t.status, to },
        },
        db,
      );
    };
    if (tx) await run(tx);
    else await this.prisma.$transaction(run);

    await this.notifications.notify(
      [t.requesterId, t.assigneeId],
      {
        kind: 'TICKET_STATUS_CHANGED',
        title: `${formatTicketNumber(t.number)}: ${TICKET_STATUS_LABELS[to]}`,
        body: t.subject,
        link: link(t.id),
        entityType: 'ticket',
        entityId: t.id,
      },
      { exclude: actor.user.id },
    );
  }

  async addComment(
    id: string,
    input: AddCommentInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<TicketDetail> {
    const t = await this.findVisible(id, actor);
    const isRequester = t.requesterId === actor.user.id;
    const canManage = actor.permissions.has('ticket.manage');
    if (t.status === 'CLOSED') throw new BadRequestException('El ticket está cerrado');
    if (!canManage && !(isRequester && actor.permissions.has('ticket.comment.own'))) {
      throw new ForbiddenException('No podés comentar este ticket');
    }
    if (input.visibility === 'INTERNAL' && !actor.permissions.has('ticket.comment.internal')) {
      throw new ForbiddenException('No podés escribir comentarios internos');
    }
    const now = new Date();
    const isStaffReply = !isRequester && input.visibility === 'PUBLIC';

    await this.prisma.ticketComment.create({
      data: {
        ticketId: id,
        authorId: actor.user.id,
        body: input.body,
        visibility: input.visibility,
        createdAt: now,
      },
    });
    // La primera respuesta pública de IT cumple el SLA de primera respuesta.
    if (isStaffReply && !t.firstRespondedAt) {
      await this.prisma.ticket.update({ where: { id }, data: { firstRespondedAt: now } });
    }
    // Si responde el solicitante en "Esperando usuario" o "Resuelto", el ticket vuelve a "En curso".
    if (isRequester && (t.status === 'WAITING_USER' || t.status === 'RESOLVED')) {
      await this.applyStatus(t, 'IN_PROGRESS', actor, meta);
    }

    const number = formatTicketNumber(t.number);
    const recipients =
      input.visibility === 'INTERNAL'
        ? [t.assigneeId]
        : isRequester
          ? t.assigneeId
            ? [t.assigneeId]
            : await this.notifications.usersWithPermission('ticket.manage')
          : [t.requesterId, t.assigneeId];
    await this.notifications.notify(
      recipients,
      {
        kind: 'TICKET_COMMENTED',
        title:
          input.visibility === 'INTERNAL'
            ? `Nota interna en ${number}`
            : `Nueva respuesta en ${number}`,
        body: input.body.slice(0, 140),
        link: link(id),
        entityType: 'ticket',
        entityId: id,
      },
      { exclude: actor.user.id },
    );
    return this.get(id, actor);
  }

  async addTimeEntry(
    id: string,
    input: AddTimeEntryInput,
    actor: AuthContext,
  ): Promise<TicketDetail> {
    await this.findVisible(id, actor);
    await this.prisma.timeEntry.create({
      data: {
        ticketId: id,
        userId: actor.user.id,
        minutes: input.minutes,
        // Sin fecha, se toma el día de hoy en la zona horaria del horario hábil.
        workDate: new Date(
          input.workDate ??
            localDateKey(new Date(), (await this.settings.getBusinessHours()).timezone),
        ),
        note: input.note,
      },
    });
    return this.get(id, actor);
  }
}
