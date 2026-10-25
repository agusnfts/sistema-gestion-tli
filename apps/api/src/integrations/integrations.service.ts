import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  formatIntegrationCode,
  formatTicketNumber,
  HOW_IT_WORKS_TEMPLATE,
  isIntegrationFinal,
  OPEN_STATUSES,
  type AddWorkLogInput,
  type ChangeIntegrationStatusInput,
  type ChangeIntegrationStatusResponse,
  type CreateDocumentParsed,
  type CreateIntegrationParsed,
  type IntegrationDetail,
  type IntegrationListItem,
  type IntegrationStatus,
  type ListIntegrationsQuery,
  type Paginated,
  type QuoteParsed,
  type UpdateIntegrationInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from '../tickets/tickets.service';
import { FilesService, toAttachmentInfo } from '../files/files.service';
import { DocumentsService } from '../documents/documents.service';
import { IndexingService } from '../knowledge/indexing.service';
import { sanitizeRichText } from '../common/rich-text';
import type { AuthContext, RequestMeta } from '../common/auth-context';

/** "Integraciones pendientes": todo lo que no está finalizado ni descartado. */
export const PENDING_INTEGRATION_STATUSES: readonly IntegrationStatus[] = [
  'PENDING_SURVEY',
  'PENDING_QUOTE',
  'QUOTED',
  'IN_DEVELOPMENT',
];
const FINAL = ['COMPLETED', 'NOT_DONE'] as const;

const userRef = { select: { id: true, fullName: true } } as const;
const clientRef = { select: { id: true, legalName: true, shortName: true } } as const;
const platformRef = {
  select: { id: true, name: true, category: true },
  orderBy: { name: 'asc' },
} as const;
const listInclude = {
  client: clientRef,
  owner: userRef,
  platforms: platformRef,
  _count: { select: { tickets: true } },
} satisfies Prisma.IntegrationInclude;
type IntegrationRow = Prisma.IntegrationGetPayload<{ include: typeof listInclude }>;

const toNumber = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const toDate = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const fromDate = (s: string | null | undefined) =>
  s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`);

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
    private readonly files: FilesService,
    private readonly documents: DocumentsService,
    private readonly indexing: IndexingService,
  ) {}

  private toListItem(i: IntegrationRow): IntegrationListItem {
    return {
      id: i.id,
      code: formatIntegrationCode(i.number),
      name: i.name,
      status: i.status,
      counterpartType: i.counterpartType,
      client: i.client,
      counterpartLabel:
        (i.client ? (i.client.shortName ?? i.client.legalName) : i.counterpartName) ?? '—',
      processes: i.processes,
      systems: i.systems,
      platforms: i.platforms,
      direction: i.direction,
      channel: i.channel,
      owner: i.owner,
      targetDate: toDate(i.targetDate),
      notDoneReason: i.notDoneReason,
      ticketCount: i._count.tickets,
      updatedAt: i.updatedAt.toISOString(),
    };
  }

  async list(q: ListIntegrationsQuery): Promise<Paginated<IntegrationListItem>> {
    const where: Prisma.IntegrationWhereInput = {
      systems: q.system ? { has: q.system } : undefined,
      platforms: q.platformId ? { some: { id: q.platformId } } : undefined,
      clientId: q.clientId,
      status:
        q.status ??
        (q.state === 'pending'
          ? { in: [...PENDING_INTEGRATION_STATUSES] }
          : q.state === 'closed'
            ? { in: [...FINAL] }
            : undefined),
    };
    if (q.q) {
      const n = /^(?:int-?)?0*(\d{1,9})$/i.exec(q.q.trim());
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { counterpartName: { contains: q.q, mode: 'insensitive' } },
        { client: { legalName: { contains: q.q, mode: 'insensitive' } } },
        { client: { shortName: { contains: q.q, mode: 'insensitive' } } },
        ...(n ? [{ number: Number(n[1]) }] : []),
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.integration.count({ where }),
      this.prisma.integration.findMany({
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

  async get(id: string): Promise<IntegrationDetail> {
    const i = await this.prisma.integration.findUnique({
      where: { id },
      include: {
        ...listInclude,
        createdBy: userRef,
        tickets: { include: { requester: userRef }, orderBy: { createdAt: 'desc' } },
        quotes: {
          include: {
            provider: { select: { id: true, name: true } },
            attachments: true,
            createdBy: userRef,
          },
          orderBy: { quotedAt: 'desc' },
        },
        revisions: { include: { author: userRef }, orderBy: { createdAt: 'desc' }, take: 50 },
        actions: {
          include: { author: userRef, attachments: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!i) throw new NotFoundException('Integración inexistente');
    const [activity, documents] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where: { entityType: 'integration', entityId: id },
        include: { actor: userRef },
        orderBy: { occurredAt: 'asc' },
      }),
      this.documents.listFor('INTEGRATION', id),
    ]);
    const selected = i.quotes.find((q) => q.isSelected);
    return {
      ...this.toListItem(i),
      counterpartName: i.counterpartName,
      format: i.format,
      frequency: i.frequency,
      location: i.location,
      requiresDevelopment: i.requiresDevelopment,
      notDoneNotes: i.notDoneNotes,
      howItWorks: i.howItWorks,
      currency: i.currency,
      estimatedHours: toNumber(i.estimatedHours),
      actualHours: toNumber(i.actualHours),
      actualCost: toNumber(i.actualCost),
      estimatedCost: selected
        ? { amount: selected.amount.toNumber(), currency: selected.currency }
        : null,
      startDate: toDate(i.startDate),
      goLiveDate: toDate(i.goLiveDate),
      closingMessage: i.closingMessage,
      completedAt: i.completedAt?.toISOString() ?? null,
      createdBy: i.createdBy,
      createdAt: i.createdAt.toISOString(),
      quotes: i.quotes.map((q) => ({
        id: q.id,
        provider: q.provider,
        amount: q.amount.toNumber(),
        currency: q.currency,
        estimatedHours: toNumber(q.estimatedHours),
        quotedAt: toDate(q.quotedAt)!,
        notes: q.notes,
        isSelected: q.isSelected,
        attachments: q.attachments.map(toAttachmentInfo),
        createdBy: q.createdBy,
      })),
      revisions: i.revisions.map((r) => ({
        id: r.id,
        howItWorks: r.howItWorks,
        author: r.author,
        createdAt: r.createdAt.toISOString(),
      })),
      tickets: i.tickets.map((t) => ({
        id: t.id,
        number: formatTicketNumber(t.number),
        subject: t.subject,
        status: t.status,
        requester: t.requester,
        createdAt: t.createdAt.toISOString(),
      })),
      documents,
      actions: i.actions.map((a) => ({
        id: a.id,
        author: a.author,
        body: a.body,
        createdAt: a.createdAt.toISOString(),
        attachments: a.attachments.map(toAttachmentInfo),
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

  private async assertClient(clientId: string | null | undefined): Promise<void> {
    if (!clientId) return;
    const exists = await this.prisma.client.count({ where: { id: clientId } });
    if (!exists) throw new BadRequestException('El cliente no existe');
  }

  private async assertPlatforms(ids: string[] | undefined): Promise<void> {
    if (!ids?.length) return;
    const count = await this.prisma.platform.count({ where: { id: { in: ids } } });
    if (count !== new Set(ids).size) throw new BadRequestException('Alguna plataforma no existe');
  }

  private async assertOpenTickets(ticketIds: string[]): Promise<string[]> {
    const ids = [...new Set(ticketIds)];
    if (!ids.length) return ids;
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
    return ids;
  }

  private async derive(
    id: string,
    number: number,
    ticketIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<void> {
    const code = formatIntegrationCode(number);
    const derived: string[] = [];
    for (const t of ticketIds) {
      if (await this.tickets.derive(t, { kind: 'integration', id, code }, actor, meta)) {
        derived.push(t);
      }
    }
    if (!derived.length) return;
    await this.prisma.activityEvent.create({
      data: {
        entityType: 'integration',
        entityId: id,
        actorId: actor.user.id,
        kind: 'LINKED',
        field: 'tickets',
        newValue: String(derived.length),
      },
    });
    await this.audit.log({
      action: 'integration.tickets.linked',
      actorId: actor.user.id,
      entityType: 'integration',
      entityId: id,
      ip: meta.ip,
      metadata: { ticketIds: derived },
    });
  }

  async create(
    input: CreateIntegrationParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    await this.assertClient(input.clientId);
    await this.assertPlatforms(input.platformIds);
    const ticketIds = await this.assertOpenTickets(input.ticketIds ?? []);
    const isClient = input.counterpartType === 'CLIENT';
    const integration = await this.prisma.$transaction(async (tx) => {
      const i = await tx.integration.create({
        data: {
          name: input.name,
          counterpartType: input.counterpartType,
          clientId: isClient ? input.clientId! : null,
          counterpartName: isClient ? null : (input.counterpartName ?? null),
          processes: input.processes,
          systems: input.systems,
          platforms: { connect: input.platformIds.map((p) => ({ id: p })) },
          direction: input.direction ?? null,
          channel: input.channel ?? null,
          format: input.format ?? null,
          frequency: input.frequency ?? null,
          location: input.location ?? null,
          requiresDevelopment: input.requiresDevelopment,
          howItWorks: HOW_IT_WORKS_TEMPLATE,
          ownerId: actor.user.id,
          createdById: actor.user.id,
        },
      });
      await tx.activityEvent.create({
        data: {
          entityType: 'integration',
          entityId: i.id,
          actorId: actor.user.id,
          kind: 'CREATED',
        },
      });
      await this.audit.log(
        {
          action: 'integration.created',
          actorId: actor.user.id,
          entityType: 'integration',
          entityId: i.id,
          ip: meta.ip,
          metadata: { number: i.number, clientId: i.clientId },
        },
        tx,
      );
      return i;
    });
    await this.derive(integration.id, integration.number, ticketIds, actor, meta);
    await this.indexing.indexIntegration(integration.id);
    return this.get(integration.id);
  }

  async update(
    id: string,
    input: UpdateIntegrationInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    const i = await this.prisma.integration.findUnique({
      where: { id },
      include: { platforms: { select: { id: true } } },
    });
    if (!i) throw new NotFoundException('Integración inexistente');
    if (input.ownerId) {
      const staff = await this.notifications.usersWithPermission('integration.manage');
      if (!staff.includes(input.ownerId))
        throw new BadRequestException('El responsable tiene que ser de IT');
    }
    await this.assertClient(input.clientId);
    await this.assertPlatforms(input.platformIds);
    const { startDate, targetDate, goLiveDate, platformIds, ...rest } = input;
    const data: Prisma.IntegrationUncheckedUpdateInput = {
      ...rest,
      platforms: platformIds ? { set: platformIds.map((p) => ({ id: p })) } : undefined,
      startDate: fromDate(startDate),
      targetDate: fromDate(targetDate),
      goLiveDate: fromDate(goLiveDate),
    };
    // La contraparte queda consistente: con cliente no hay nombre libre, y viceversa.
    const type = input.counterpartType ?? i.counterpartType;
    if (type === 'CLIENT') {
      data.counterpartName = null;
      if (!(input.clientId ?? i.clientId)) throw new BadRequestException('Elegí el cliente');
    } else if (input.counterpartType) {
      data.clientId = null;
      if (!(input.counterpartName ?? i.counterpartName))
        throw new BadRequestException('Indicá con quién es la integración');
    }

    const before = i as unknown as Record<string, unknown>;
    const currentPlatforms = i.platforms.map((p) => p.id);
    const changed = Object.keys(input).filter((k) => {
      const v = (input as Record<string, unknown>)[k];
      if (v === undefined) return false;
      const old = k === 'platformIds' ? currentPlatforms : before[k];
      if (Array.isArray(old)) return [...old].sort().join() !== [...(v as string[])].sort().join();
      if (old instanceof Date) return toDate(old) !== v;
      if (old instanceof Prisma.Decimal) return old.toNumber() !== v;
      return old !== v;
    });
    if (!changed.length) return this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.integration.update({ where: { id }, data });
      await tx.activityEvent.createMany({
        data: changed.map((field) => ({
          entityType: 'integration',
          entityId: id,
          actorId: actor.user.id,
          kind: 'FIELD_CHANGED',
          field,
        })),
      });
      await this.audit.log(
        {
          action: 'integration.updated',
          actorId: actor.user.id,
          entityType: 'integration',
          entityId: id,
          ip: meta.ip,
          metadata: { fields: changed },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Guarda "Cómo funciona" (HTML sanitizado); la versión anterior queda en el historial. */
  async setHowItWorks(
    id: string,
    raw: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    const howItWorks = sanitizeRichText(raw);
    const i = await this.prisma.integration.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Integración inexistente');
    if (i.howItWorks === howItWorks) return this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationRevision.create({
        data: { integrationId: id, howItWorks: i.howItWorks, authorId: actor.user.id },
      });
      await tx.integration.update({ where: { id }, data: { howItWorks } });
      await this.audit.log(
        {
          action: 'integration.how_it_works.changed',
          actorId: actor.user.id,
          entityType: 'integration',
          entityId: id,
          ip: meta.ip,
        },
        tx,
      );
    });
    await this.indexing.indexIntegration(id);
    return this.get(id);
  }

  async changeStatus(
    id: string,
    input: ChangeIntegrationStatusInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ChangeIntegrationStatusResponse> {
    const i = await this.prisma.integration.findUnique({
      where: { id },
      include: { tickets: { select: { id: true } } },
    });
    if (!i) throw new NotFoundException('Integración inexistente');
    if (i.status === input.status)
      throw new BadRequestException('La integración ya está en ese estado');
    if (isIntegrationFinal(i.status)) {
      throw new BadRequestException('La integración está cerrada: sus tickets ya se cerraron');
    }
    const final = isIntegrationFinal(input.status);
    const notDone = input.status === 'NOT_DONE';
    await this.prisma.$transaction(async (tx) => {
      await tx.integration.update({
        where: { id },
        data: {
          status: input.status,
          notDoneReason: notDone ? input.notDoneReason : null,
          notDoneNotes: notDone ? (input.notDoneNotes ?? null) : null,
          completedAt: final ? new Date() : null,
          closingMessage: final ? input.closingMessage : null,
          goLiveDate: input.status === 'COMPLETED' && !i.goLiveDate ? new Date() : undefined,
        },
      });
      await tx.activityEvent.create({
        data: {
          entityType: 'integration',
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
          action: 'integration.status.changed',
          actorId: actor.user.id,
          entityType: 'integration',
          entityId: id,
          ip: meta.ip,
          metadata: { from: i.status, to: input.status, notDoneReason: input.notDoneReason },
        },
        tx,
      );
    });

    // Cierre en bloque: cada ticket derivado se cierra con el mensaje y se avisa al solicitante.
    let closedTickets = 0;
    if (final) {
      for (const t of i.tickets) {
        if (
          await this.tickets.closeDerived(t.id, 'integration', input.closingMessage!, actor, meta)
        ) {
          closedTickets++;
        }
      }
    }
    return { integration: await this.get(id), closedTickets };
  }

  private async exists(
    id: string,
  ): Promise<{ id: string; number: number; status: IntegrationStatus }> {
    const i = await this.prisma.integration.findUnique({
      where: { id },
      select: { id: true, number: true, status: true },
    });
    if (!i) throw new NotFoundException('Integración inexistente');
    return i;
  }

  private async logQuote(id: string, actor: AuthContext, meta: RequestMeta, change: string) {
    await this.audit.log({
      action: 'integration.quote.changed',
      actorId: actor.user.id,
      entityType: 'integration',
      entityId: id,
      ip: meta.ip,
      metadata: { change },
    });
  }

  async addQuote(
    id: string,
    input: QuoteParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    await this.exists(id);
    const provider = await this.prisma.provider.count({ where: { id: input.providerId } });
    if (!provider) throw new BadRequestException('El proveedor no existe');
    await this.prisma.$transaction(async (tx) => {
      const q = await tx.integrationQuote.create({
        data: {
          integrationId: id,
          providerId: input.providerId,
          amount: input.amount,
          currency: input.currency,
          estimatedHours: input.estimatedHours ?? null,
          quotedAt: new Date(`${input.quotedAt}T00:00:00.000Z`),
          notes: input.notes ?? null,
          createdById: actor.user.id,
        },
      });
      await this.files.link(input.attachmentIds, actor, { integrationQuoteId: q.id }, tx);
    });
    await this.logQuote(id, actor, meta, 'created');
    return this.get(id);
  }

  /** Marca una cotización como elegida (desmarca las demás). Con null no queda ninguna. */
  async selectQuote(
    id: string,
    quoteId: string | null,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    await this.exists(id);
    if (quoteId) {
      const q = await this.prisma.integrationQuote.count({
        where: { id: quoteId, integrationId: id },
      });
      if (!q) throw new NotFoundException('Cotización inexistente');
    }
    await this.prisma.$transaction([
      this.prisma.integrationQuote.updateMany({
        where: { integrationId: id },
        data: { isSelected: false },
      }),
      ...(quoteId
        ? [
            this.prisma.integrationQuote.update({
              where: { id: quoteId },
              data: { isSelected: true },
            }),
          ]
        : []),
    ]);
    await this.logQuote(id, actor, meta, quoteId ? 'selected' : 'unselected');
    return this.get(id);
  }

  async deleteQuote(
    id: string,
    quoteId: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    const { count } = await this.prisma.integrationQuote.deleteMany({
      where: { id: quoteId, integrationId: id },
    });
    if (!count) throw new NotFoundException('Cotización inexistente');
    await this.logQuote(id, actor, meta, 'deleted');
    return this.get(id);
  }

  async addAction(
    id: string,
    input: AddWorkLogInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    await this.exists(id);
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.integrationAction.create({
        data: { integrationId: id, authorId: actor.user.id, body: input.body },
      });
      await this.files.link(input.attachmentIds, actor, { integrationActionId: entry.id }, tx);
      await this.audit.log(
        {
          action: 'integration.action.added',
          actorId: actor.user.id,
          entityType: 'integration',
          entityId: id,
          ip: meta.ip,
          metadata: { entryId: entry.id, attachments: input.attachmentIds?.length ?? 0 },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async linkTickets(
    id: string,
    ticketIds: string[],
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    const i = await this.exists(id);
    if (isIntegrationFinal(i.status)) throw new BadRequestException('La integración está cerrada');
    const ids = await this.assertOpenTickets(ticketIds);
    await this.derive(id, i.number, ids, actor, meta);
    return this.get(id);
  }

  async unlinkTicket(
    id: string,
    ticketId: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    const i = await this.exists(id);
    if (isIntegrationFinal(i.status)) throw new BadRequestException('La integración está cerrada');
    if (!(await this.tickets.returnDerived(ticketId, 'integration', id, actor, meta))) {
      throw new NotFoundException('El ticket no está en esta integración');
    }
    await this.prisma.activityEvent.create({
      data: {
        entityType: 'integration',
        entityId: id,
        actorId: actor.user.id,
        kind: 'UNLINKED',
        field: 'tickets',
      },
    });
    await this.audit.log({
      action: 'integration.tickets.unlinked',
      actorId: actor.user.id,
      entityType: 'integration',
      entityId: id,
      ip: meta.ip,
      metadata: { ticketId },
    });
    return this.get(id);
  }

  async addDocument(
    id: string,
    input: CreateDocumentParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<IntegrationDetail> {
    await this.exists(id);
    await this.documents.create({ type: 'INTEGRATION', id }, input, actor, meta);
    return this.get(id);
  }
}
