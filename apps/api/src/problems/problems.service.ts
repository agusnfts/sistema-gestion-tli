import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  formatProblemCode,
  formatTicketNumber,
  OPEN_STATUSES,
  type ChangeProblemStatusInput,
  type ChangeProblemStatusResponse,
  type CreateProblemInput,
  type ListProblemsQuery,
  type Paginated,
  type ProblemDetail,
  type ProblemListItem,
  type SimilarResults,
  type UpdateProblemInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SimilarityService } from '../search/similarity.service';
import { TicketsService } from '../tickets/tickets.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const userRef = { select: { id: true, fullName: true } } as const;
const listInclude = {
  owner: userRef,
  _count: { select: { tickets: true } },
} satisfies Prisma.ProblemInclude;

type ProblemRow = Prisma.ProblemGetPayload<{ include: typeof listInclude }>;

@Injectable()
export class ProblemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
    private readonly similarity: SimilarityService,
  ) {}

  private async openCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.ticket.groupBy({
      by: ['problemId'],
      where: { problemId: { in: ids }, status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.problemId!, r._count._all]));
  }

  private toListItem(p: ProblemRow, open: number): ProblemListItem {
    return {
      id: p.id,
      code: formatProblemCode(p.number),
      title: p.title,
      status: p.status,
      category: p.category,
      owner: p.owner,
      ticketCount: p._count.tickets,
      openTicketCount: open,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async list(q: ListProblemsQuery): Promise<Paginated<ProblemListItem>> {
    const where: Prisma.ProblemWhereInput = {
      status:
        q.state === 'open' ? { not: 'RESOLVED' } : q.state === 'resolved' ? 'RESOLVED' : undefined,
    };
    if (q.q) {
      const n = /^(?:prb-?)?0*(\d{1,9})$/i.exec(q.q.trim());
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        ...(n ? [{ number: Number(n[1]) }] : []),
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.problem.count({ where }),
      this.prisma.problem.findMany({
        where,
        include: listInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const open = await this.openCounts(rows.map((r) => r.id));
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => this.toListItem(r, open.get(r.id) ?? 0)),
    };
  }

  async get(id: string): Promise<ProblemDetail> {
    const p = await this.prisma.problem.findUnique({
      where: { id },
      include: {
        ...listInclude,
        createdBy: userRef,
        tickets: { include: { requester: userRef }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!p) throw new NotFoundException('Problema inexistente');
    const activity = await this.prisma.activityEvent.findMany({
      where: { entityType: 'problem', entityId: id },
      include: { actor: userRef },
      orderBy: { occurredAt: 'asc' },
    });
    const open = p.tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    return {
      ...this.toListItem(p, open),
      description: p.description,
      rootCause: p.rootCause,
      workaround: p.workaround,
      permanentSolution: p.permanentSolution,
      resolvedAt: p.resolvedAt?.toISOString() ?? null,
      createdBy: p.createdBy,
      tickets: p.tickets.map((t) => ({
        id: t.id,
        number: formatTicketNumber(t.number),
        subject: t.subject,
        status: t.status,
        requester: t.requester,
        createdAt: t.createdAt.toISOString(),
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

  async create(
    input: CreateProblemInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ProblemDetail> {
    const problem = await this.prisma.$transaction(async (tx) => {
      const p = await tx.problem.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          createdById: actor.user.id,
          ownerId: actor.user.id,
        },
      });
      await tx.activityEvent.create({
        data: { entityType: 'problem', entityId: p.id, actorId: actor.user.id, kind: 'CREATED' },
      });
      await this.audit.log(
        {
          action: 'problem.created',
          actorId: actor.user.id,
          entityType: 'problem',
          entityId: p.id,
          ip: meta.ip,
          metadata: { number: p.number },
        },
        tx,
      );
      if (input.ticketIds?.length)
        await this.linkInTx(tx, p.id, p.number, input.ticketIds, actor, meta);
      return p;
    });
    return this.get(problem.id);
  }

  async update(id: string, input: UpdateProblemInput, actor: AuthContext): Promise<ProblemDetail> {
    const p = await this.prisma.problem.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Problema inexistente');
    if (input.ownerId) {
      const staff = await this.notifications.usersWithPermission('problem.manage');
      if (!staff.includes(input.ownerId))
        throw new BadRequestException('El responsable tiene que ser de IT');
    }
    const fields = (Object.keys(input) as (keyof UpdateProblemInput)[]).filter(
      (k) => input[k] !== undefined && input[k] !== p[k],
    );
    if (!fields.length) return this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.problem.update({ where: { id }, data: input });
      await tx.activityEvent.createMany({
        data: fields.map((field) => ({
          entityType: 'problem',
          entityId: id,
          actorId: actor.user.id,
          kind: 'FIELD_CHANGED',
          field,
        })),
      });
    });
    return this.get(id);
  }

  async changeStatus(
    id: string,
    input: ChangeProblemStatusInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ChangeProblemStatusResponse> {
    const p = await this.prisma.problem.findUnique({ where: { id }, include: { tickets: true } });
    if (!p) throw new NotFoundException('Problema inexistente');
    if (p.status === input.status)
      throw new BadRequestException('El problema ya está en ese estado');
    const solution = p.permanentSolution ?? p.workaround;
    if (input.status === 'RESOLVED' && !solution) {
      throw new BadRequestException(
        'Antes de resolver, cargá la solución definitiva o el workaround',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.problem.update({
        where: { id },
        data: { status: input.status, resolvedAt: input.status === 'RESOLVED' ? new Date() : null },
      });
      await tx.activityEvent.create({
        data: {
          entityType: 'problem',
          entityId: id,
          actorId: actor.user.id,
          kind: 'STATUS_CHANGED',
          field: 'status',
          oldValue: p.status,
          newValue: input.status,
        },
      });
      await this.audit.log(
        {
          action: 'problem.status.changed',
          actorId: actor.user.id,
          entityType: 'problem',
          entityId: id,
          ip: meta.ip,
          metadata: { from: p.status, to: input.status, resolveTickets: input.resolveTickets },
        },
        tx,
      );
    });

    // Resolución en bloque: cada ticket abierto vinculado se resuelve con la causa y la solución
    // del problema, y su solicitante recibe el mensaje.
    let resolvedTickets = 0;
    if (input.status === 'RESOLVED' && input.resolveTickets) {
      const message =
        input.message?.trim() ||
        `Identificamos la causa de este inconveniente (${formatProblemCode(p.number)}) y ya está resuelto. ` +
          `Solución: ${solution}. Si el problema sigue, respondé este ticket y lo reabrimos.`;
      for (const t of p.tickets.filter((t) => OPEN_STATUSES.includes(t.status))) {
        const done = await this.tickets.resolveFromProblem(
          t.id,
          { cause: p.rootCause ?? p.title, solution: solution!, message },
          actor,
          meta,
        );
        if (done) resolvedTickets++;
      }
    }
    return { problem: await this.get(id), resolvedTickets };
  }

  async link(
    id: string,
    ticketIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ProblemDetail> {
    const p = await this.prisma.problem.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Problema inexistente');
    await this.prisma.$transaction((tx) => this.linkInTx(tx, id, p.number, ticketIds, actor, meta));
    return this.get(id);
  }

  /** Un ticket pertenece a un solo problema: vincularlo a otro lo mueve. */
  private async linkInTx(
    tx: Prisma.TransactionClient,
    problemId: string,
    problemNumber: number,
    ticketIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<void> {
    const ids = [...new Set(ticketIds)];
    const found = await tx.ticket.findMany({
      where: { id: { in: ids } },
      select: { id: true, problemId: true },
    });
    if (found.length !== ids.length) throw new BadRequestException('Algún ticket no existe');
    const toLink = found.filter((t) => t.problemId !== problemId);
    if (!toLink.length) return;
    await tx.ticket.updateMany({
      where: { id: { in: toLink.map((t) => t.id) } },
      data: { problemId },
    });
    const code = formatProblemCode(problemNumber);
    await tx.activityEvent.createMany({
      data: [
        ...toLink.map((t) => ({
          entityType: 'ticket',
          entityId: t.id,
          actorId: actor.user.id,
          kind: 'LINKED',
          field: 'problem',
          newValue: code,
        })),
        {
          entityType: 'problem',
          entityId: problemId,
          actorId: actor.user.id,
          kind: 'LINKED',
          field: 'tickets',
          newValue: String(toLink.length),
        },
      ],
    });
    await this.audit.log(
      {
        action: 'problem.tickets.linked',
        actorId: actor.user.id,
        entityType: 'problem',
        entityId: problemId,
        ip: meta.ip,
        metadata: { ticketIds: toLink.map((t) => t.id) },
      },
      tx,
    );
  }

  async unlink(
    id: string,
    ticketId: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ProblemDetail> {
    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticketId, problemId: id },
      data: { problemId: null },
    });
    if (!count) throw new NotFoundException('El ticket no está vinculado a este problema');
    await this.prisma.activityEvent.create({
      data: {
        entityType: 'ticket',
        entityId: ticketId,
        actorId: actor.user.id,
        kind: 'UNLINKED',
        field: 'problem',
      },
    });
    await this.audit.log({
      action: 'problem.tickets.unlinked',
      actorId: actor.user.id,
      entityType: 'problem',
      entityId: id,
      ip: meta.ip,
      metadata: { ticketId },
    });
    return this.get(id);
  }

  /** Tickets parecidos al problema que todavía no están vinculados. */
  async suggestions(id: string): Promise<SimilarResults> {
    const p = await this.prisma.problem.findUnique({
      where: { id },
      include: { tickets: { select: { id: true } } },
    });
    if (!p) throw new NotFoundException('Problema inexistente');
    const result = await this.similarity.find(
      { title: p.title, body: `${p.description} ${p.rootCause ?? ''}` },
      { ticketIds: p.tickets.map((t) => t.id), problemId: p.id },
    );
    return { tickets: result.tickets, problems: [] };
  }
}
