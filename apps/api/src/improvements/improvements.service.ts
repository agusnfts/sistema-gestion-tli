import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  formatImprovementCode,
  formatProblemCode,
  formatTicketNumber,
  improvementPriority,
  isImprovementFinal,
  OPEN_STATUSES,
  type ChangeImprovementStatusInput,
  type ChangeImprovementStatusResponse,
  type AddWorkLogInput,
  type CreateImprovementInput,
  type ImprovementDetail,
  type ImprovementListItem,
  type ListImprovementsQuery,
  type Paginated,
  type UpdateImprovementInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from '../tickets/tickets.service';
import { FilesService, toAttachmentInfo } from '../files/files.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const userRef = { select: { id: true, fullName: true } } as const;
const named = { select: { id: true, name: true } } as const;
const listInclude = {
  owner: userRef,
  provider: named,
  requestingArea: named,
  _count: { select: { tickets: true } },
} satisfies Prisma.ImprovementInclude;

type ImprovementRow = Prisma.ImprovementGetPayload<{ include: typeof listInclude }>;

const FINAL = ['IMPLEMENTED', 'DISCARDED'] as const;

const toNumber = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const toDate = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const fromDate = (s: string | null | undefined) =>
  s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`);

@Injectable()
export class ImprovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
    private readonly files: FilesService,
  ) {}

  private toListItem(i: ImprovementRow): ImprovementListItem {
    return {
      id: i.id,
      code: formatImprovementCode(i.number),
      title: i.title,
      status: i.status,
      system: i.system,
      priority: i.priority,
      impact: i.impact,
      effort: i.effort,
      owner: i.owner,
      provider: i.provider,
      requestingArea: i.requestingArea,
      ticketCount: i._count.tickets,
      targetDate: toDate(i.targetDate),
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    };
  }

  async list(q: ListImprovementsQuery): Promise<Paginated<ImprovementListItem>> {
    const where: Prisma.ImprovementWhereInput = {
      ownerId: q.owner,
      system: q.system,
      status:
        q.status ??
        (q.state === 'active'
          ? { notIn: [...FINAL] }
          : q.state === 'closed'
            ? { in: [...FINAL] }
            : undefined),
    };
    if (q.q) {
      const n = /^(?:mej-?)?0*(\d{1,9})$/i.exec(q.q.trim());
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { proposal: { contains: q.q, mode: 'insensitive' } },
        ...(n ? [{ number: Number(n[1]) }] : []),
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.improvement.count({ where }),
      this.prisma.improvement.findMany({
        where,
        include: listInclude,
        orderBy: [{ updatedAt: 'desc' }],
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

  async get(id: string): Promise<ImprovementDetail> {
    const i = await this.prisma.improvement.findUnique({
      where: { id },
      include: {
        ...listInclude,
        createdBy: userRef,
        tickets: { include: { requester: userRef }, orderBy: { createdAt: 'desc' } },
        problems: { orderBy: { number: 'asc' } },
        clients: {
          select: { id: true, legalName: true, shortName: true },
          orderBy: { legalName: 'asc' },
        },
        comments: {
          include: { author: userRef, attachments: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!i) throw new NotFoundException('Mejora inexistente');
    const activity = await this.prisma.activityEvent.findMany({
      where: { entityType: 'improvement', entityId: id },
      include: { actor: userRef },
      orderBy: { occurredAt: 'asc' },
    });
    return {
      ...this.toListItem(i),
      currentSituation: i.currentSituation,
      proposal: i.proposal,
      expectedImpact: i.expectedImpact,
      priorityIsManual: i.priorityIsManual,
      currency: i.currency,
      estimatedCost: toNumber(i.estimatedCost),
      actualCost: toNumber(i.actualCost),
      estimatedHours: toNumber(i.estimatedHours),
      actualHours: toNumber(i.actualHours),
      startDate: toDate(i.startDate),
      completedAt: i.completedAt?.toISOString() ?? null,
      closingMessage: i.closingMessage,
      createdBy: i.createdBy,
      tickets: i.tickets.map((t) => ({
        id: t.id,
        number: formatTicketNumber(t.number),
        subject: t.subject,
        status: t.status,
        requester: t.requester,
        createdAt: t.createdAt.toISOString(),
      })),
      clients: i.clients,
      problems: i.problems.map((p) => ({
        id: p.id,
        code: formatProblemCode(p.number),
        title: p.title,
        status: p.status,
      })),
      actions: i.comments.map((c) => ({
        id: c.id,
        author: c.author,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        attachments: c.attachments.map(toAttachmentInfo),
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
    };
  }

  /** Tickets que se derivan: los pedidos explícitamente más los abiertos de los problemas. */
  private async ticketsToDerive(ticketIds: string[], problemIds: string[]): Promise<string[]> {
    const ids = [...new Set(ticketIds)];
    if (ids.length) {
      const found = await this.prisma.ticket.findMany({
        where: { id: { in: ids } },
        select: { id: true, number: true, status: true },
      });
      if (found.length !== ids.length) throw new BadRequestException('Algún ticket no existe');
      const notOpen = found.filter((t) => !OPEN_STATUSES.includes(t.status));
      if (notOpen.length) {
        throw new BadRequestException(
          `Solo se pueden derivar tickets abiertos: ${notOpen.map((t) => formatTicketNumber(t.number)).join(', ')}`,
        );
      }
    }
    if (problemIds.length) {
      const fromProblems = await this.prisma.ticket.findMany({
        where: { problemId: { in: problemIds }, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      });
      for (const t of fromProblems) if (!ids.includes(t.id)) ids.push(t.id);
    }
    return ids;
  }

  private async assertProblems(problemIds: string[]): Promise<void> {
    if (!problemIds.length) return;
    const count = await this.prisma.problem.count({ where: { id: { in: problemIds } } });
    if (count !== problemIds.length) throw new BadRequestException('Algún problema no existe');
  }

  private async derive(
    improvementId: string,
    number: number,
    ticketIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<number> {
    const code = formatImprovementCode(number);
    const derived: string[] = [];
    for (const id of ticketIds) {
      if (
        await this.tickets.derive(id, { kind: 'improvement', id: improvementId, code }, actor, meta)
      ) {
        derived.push(id);
      }
    }
    if (derived.length) {
      await this.prisma.activityEvent.create({
        data: {
          entityType: 'improvement',
          entityId: improvementId,
          actorId: actor.user.id,
          kind: 'LINKED',
          field: 'tickets',
          newValue: String(derived.length),
        },
      });
      await this.audit.log({
        action: 'improvement.tickets.linked',
        actorId: actor.user.id,
        entityType: 'improvement',
        entityId: improvementId,
        ip: meta.ip,
        metadata: { ticketIds: derived },
      });
    }
    return derived.length;
  }

  async create(
    input: CreateImprovementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ImprovementDetail> {
    const problemIds = [...new Set(input.problemIds ?? [])];
    await this.assertProblems(problemIds);
    const ticketIds = await this.ticketsToDerive(input.ticketIds ?? [], problemIds);
    const improvement = await this.prisma.$transaction(async (tx) => {
      const i = await tx.improvement.create({
        data: {
          title: input.title,
          system: input.system,
          requestingAreaId: input.requestingAreaId ?? null,
          currentSituation: input.currentSituation,
          proposal: input.proposal,
          expectedImpact: input.expectedImpact ?? null,
          impact: input.impact,
          effort: input.effort,
          priority: improvementPriority(input.impact, input.effort),
          createdById: actor.user.id,
          ownerId: actor.user.id,
          problems: { connect: problemIds.map((id) => ({ id })) },
        },
      });
      await tx.activityEvent.create({
        data: {
          entityType: 'improvement',
          entityId: i.id,
          actorId: actor.user.id,
          kind: 'CREATED',
        },
      });
      await this.audit.log(
        {
          action: 'improvement.created',
          actorId: actor.user.id,
          entityType: 'improvement',
          entityId: i.id,
          ip: meta.ip,
          metadata: { number: i.number, problemIds },
        },
        tx,
      );
      return i;
    });
    await this.derive(improvement.id, improvement.number, ticketIds, actor, meta);
    return this.get(improvement.id);
  }

  async update(
    id: string,
    input: UpdateImprovementInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ImprovementDetail> {
    const i = await this.prisma.improvement.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Mejora inexistente');
    if (input.ownerId) {
      const staff = await this.notifications.usersWithPermission('improvement.manage');
      if (!staff.includes(input.ownerId))
        throw new BadRequestException('El responsable tiene que ser de IT');
    }
    const { priority, startDate, targetDate, ...rest } = input;
    const data: Prisma.ImprovementUncheckedUpdateInput = {
      ...rest,
      startDate: fromDate(startDate),
      targetDate: fromDate(targetDate),
    };
    // Prioridad: la fija IT a mano, o (null) vuelve a calcularse con impacto y esfuerzo.
    const impact = input.impact ?? i.impact;
    const effort = input.effort ?? i.effort;
    if (priority) Object.assign(data, { priority, priorityIsManual: true });
    else if (priority === null || !i.priorityIsManual) {
      Object.assign(data, {
        priority: improvementPriority(impact, effort),
        priorityIsManual: false,
      });
    }

    const before = i as unknown as Record<string, unknown>;
    const changed = Object.keys(input).filter((k) => {
      const v = (input as Record<string, unknown>)[k];
      if (v === undefined) return false;
      const old = before[k];
      if (old instanceof Date) return toDate(old) !== v;
      if (old instanceof Prisma.Decimal) return old.toNumber() !== v;
      return old !== v;
    });
    if (!changed.length && (data.priority === undefined || data.priority === i.priority))
      return this.get(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.improvement.update({ where: { id }, data });
      if (changed.length) {
        await tx.activityEvent.createMany({
          data: changed.map((field) => ({
            entityType: 'improvement',
            entityId: id,
            actorId: actor.user.id,
            kind: 'FIELD_CHANGED',
            field,
          })),
        });
        await this.audit.log(
          {
            action: 'improvement.updated',
            actorId: actor.user.id,
            entityType: 'improvement',
            entityId: id,
            ip: meta.ip,
            metadata: { fields: changed },
          },
          tx,
        );
      }
    });
    return this.get(id);
  }

  async changeStatus(
    id: string,
    input: ChangeImprovementStatusInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ChangeImprovementStatusResponse> {
    const i = await this.prisma.improvement.findUnique({
      where: { id },
      include: { tickets: { select: { id: true } } },
    });
    if (!i) throw new NotFoundException('Mejora inexistente');
    if (i.status === input.status) throw new BadRequestException('La mejora ya está en ese estado');
    if (isImprovementFinal(i.status)) {
      throw new BadRequestException('La mejora está cerrada: sus tickets ya se cerraron');
    }
    const final = isImprovementFinal(input.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.improvement.update({
        where: { id },
        data: {
          status: input.status,
          completedAt: final ? new Date() : null,
          closingMessage: final ? input.closingMessage : null,
        },
      });
      await tx.activityEvent.create({
        data: {
          entityType: 'improvement',
          entityId: id,
          actorId: actor.user.id,
          kind: 'STATUS_CHANGED',
          field: 'status',
          oldValue: i.status,
          newValue: input.status,
        },
      });
      await this.audit.log(
        {
          action: 'improvement.status.changed',
          actorId: actor.user.id,
          entityType: 'improvement',
          entityId: id,
          ip: meta.ip,
          metadata: { from: i.status, to: input.status },
        },
        tx,
      );
    });

    // Cierre en bloque: cada ticket derivado se cierra con el mensaje y se avisa al solicitante.
    let closedTickets = 0;
    if (final) {
      for (const t of i.tickets) {
        if (
          await this.tickets.closeDerived(t.id, 'improvement', input.closingMessage!, actor, meta)
        ) {
          closedTickets++;
        }
      }
    }
    return { improvement: await this.get(id), closedTickets };
  }

  /** Registra una acción o avance, con adjuntos. Se puede también con la mejora cerrada. */
  async addAction(
    id: string,
    input: AddWorkLogInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ImprovementDetail> {
    const i = await this.prisma.improvement.findUnique({ where: { id }, select: { id: true } });
    if (!i) throw new NotFoundException('Mejora inexistente');
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.improvementComment.create({
        data: { improvementId: id, authorId: actor.user.id, body: input.body },
      });
      await this.files.link(input.attachmentIds, actor, { improvementCommentId: entry.id }, tx);
      await this.audit.log(
        {
          action: 'improvement.action.added',
          actorId: actor.user.id,
          entityType: 'improvement',
          entityId: id,
          ip: meta.ip,
          metadata: { entryId: entry.id, attachments: input.attachmentIds?.length ?? 0 },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async openImprovement(id: string) {
    const i = await this.prisma.improvement.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Mejora inexistente');
    if (isImprovementFinal(i.status)) throw new BadRequestException('La mejora está cerrada');
    return i;
  }

  async linkTickets(
    id: string,
    ticketIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ImprovementDetail> {
    const i = await this.openImprovement(id);
    const ids = await this.ticketsToDerive(ticketIds, []);
    await this.derive(id, i.number, ids, actor, meta);
    return this.get(id);
  }

  async unlinkTicket(
    id: string,
    ticketId: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ImprovementDetail> {
    await this.openImprovement(id);
    if (!(await this.tickets.returnDerived(ticketId, 'improvement', id, actor, meta))) {
      throw new NotFoundException('El ticket no está en esta mejora');
    }
    await this.prisma.activityEvent.create({
      data: {
        entityType: 'improvement',
        entityId: id,
        actorId: actor.user.id,
        kind: 'UNLINKED',
        field: 'tickets',
      },
    });
    await this.audit.log({
      action: 'improvement.tickets.unlinked',
      actorId: actor.user.id,
      entityType: 'improvement',
      entityId: id,
      ip: meta.ip,
      metadata: { ticketId },
    });
    return this.get(id);
  }

  /** Vincula problemas y deriva sus tickets abiertos. */
  async linkProblems(
    id: string,
    problemIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ImprovementDetail> {
    const i = await this.openImprovement(id);
    const ids = [...new Set(problemIds)];
    await this.assertProblems(ids);
    await this.prisma.improvement.update({
      where: { id },
      data: { problems: { connect: ids.map((p) => ({ id: p })) } },
    });
    await this.audit.log({
      action: 'improvement.problems.linked',
      actorId: actor.user.id,
      entityType: 'improvement',
      entityId: id,
      ip: meta.ip,
      metadata: { problemIds: ids },
    });
    await this.derive(id, i.number, await this.ticketsToDerive([], ids), actor, meta);
    return this.get(id);
  }

  /** Clientes a los que apunta o afecta la mejora (aparece en su ficha). */
  async setClients(id: string, clientIds: string[], connect: boolean): Promise<ImprovementDetail> {
    const exists = await this.prisma.improvement.count({ where: { id } });
    if (!exists) throw new NotFoundException('Mejora inexistente');
    if (connect) {
      const found = await this.prisma.client.count({ where: { id: { in: clientIds } } });
      if (found !== new Set(clientIds).size)
        throw new BadRequestException('Algún cliente no existe');
    }
    const refs = clientIds.map((c) => ({ id: c }));
    await this.prisma.improvement.update({
      where: { id },
      data: { clients: connect ? { connect: refs } : { disconnect: refs } },
    });
    return this.get(id);
  }

  async unlinkProblem(id: string, problemId: string): Promise<ImprovementDetail> {
    await this.openImprovement(id);
    await this.prisma.improvement.update({
      where: { id },
      data: { problems: { disconnect: { id: problemId } } },
    });
    return this.get(id);
  }
}
