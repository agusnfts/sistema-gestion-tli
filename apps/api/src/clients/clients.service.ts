import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  formatImprovementCode,
  type ClientDetail,
  type ClientListItem,
  type ClientParsed,
  type ContactParsed,
  type CreateDocumentParsed,
  type ListClientsQuery,
  type Paginated,
  type UpdateClientInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import {
  IntegrationsService,
  PENDING_INTEGRATION_STATUSES,
} from '../integrations/integrations.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const named = { select: { id: true, name: true } } as const;
const listInclude = {
  warehouses: { ...named, orderBy: { name: 'asc' } },
  _count: { select: { integrations: true } },
} satisfies Prisma.ClientInclude;
type ClientRow = Prisma.ClientGetPayload<{ include: typeof listInclude }>;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly integrations: IntegrationsService,
  ) {}

  private async pendingCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.integration.groupBy({
      by: ['clientId'],
      where: { clientId: { in: ids }, status: { in: [...PENDING_INTEGRATION_STATUSES] } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.clientId!, r._count._all]));
  }

  private toListItem(c: ClientRow, pending: number): ClientListItem {
    return {
      id: c.id,
      legalName: c.legalName,
      shortName: c.shortName,
      cuit: c.cuit,
      status: c.status,
      warehouses: c.warehouses,
      integrationCount: c._count.integrations,
      pendingIntegrationCount: pending,
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  async list(q: ListClientsQuery): Promise<Paginated<ClientListItem>> {
    const where: Prisma.ClientWhereInput = { status: q.status };
    if (q.q) {
      const digits = q.q.replace(/[\s-]/g, '');
      where.OR = [
        { legalName: { contains: q.q, mode: 'insensitive' } },
        { shortName: { contains: q.q, mode: 'insensitive' } },
        ...(/^\d{2,11}$/.test(digits) ? [{ cuit: { contains: digits } }] : []),
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: listInclude,
        orderBy: { legalName: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const pending = await this.pendingCounts(rows.map((r) => r.id));
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => this.toListItem(r, pending.get(r.id) ?? 0)),
    };
  }

  async get(id: string, actor: AuthContext): Promise<ClientDetail> {
    const c = await this.prisma.client.findUnique({
      where: { id },
      include: {
        ...listInclude,
        contacts: { orderBy: [{ kind: 'asc' }, { name: 'asc' }] },
        improvements: { orderBy: { number: 'desc' } },
      },
    });
    if (!c) throw new NotFoundException('Cliente inexistente');
    const canIntegrations = actor.permissions.has('integration.read');
    const [pending, integrations, documents] = await Promise.all([
      this.pendingCounts([id]),
      canIntegrations
        ? this.integrations.list({
            clientId: id,
            state: 'all',
            overdue: false,
            page: 1,
            pageSize: 100,
          })
        : null,
      this.documents.listFor('CLIENT', id),
    ]);
    return {
      ...this.toListItem(c, pending.get(id) ?? 0),
      address: c.address,
      f50Folio: c.f50Folio,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      contacts: c.contacts.map((k) => ({
        id: k.id,
        kind: k.kind,
        role: k.role,
        name: k.name,
        email: k.email,
        phone: k.phone,
        notes: k.notes,
      })),
      integrations: integrations?.items ?? [],
      improvements: actor.permissions.has('improvement.read')
        ? c.improvements.map((i) => ({
            id: i.id,
            code: formatImprovementCode(i.number),
            title: i.title,
            status: i.status,
          }))
        : [],
      documents,
    };
  }

  private async uniqueCuit<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya hay un cliente con ese CUIT');
      }
      throw e;
    }
  }

  async create(input: ClientParsed, actor: AuthContext, meta: RequestMeta): Promise<ClientDetail> {
    const { warehouseIds, ...data } = input;
    const client = await this.uniqueCuit(() =>
      this.prisma.$transaction(async (tx) => {
        const c = await tx.client.create({
          data: { ...data, warehouses: { connect: warehouseIds.map((id) => ({ id })) } },
        });
        await this.audit.log(
          {
            action: 'client.created',
            actorId: actor.user.id,
            entityType: 'client',
            entityId: c.id,
            ip: meta.ip,
          },
          tx,
        );
        return c;
      }),
    );
    return this.get(client.id, actor);
  }

  async update(
    id: string,
    input: UpdateClientInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ClientDetail> {
    const exists = await this.prisma.client.count({ where: { id } });
    if (!exists) throw new NotFoundException('Cliente inexistente');
    const { warehouseIds, ...data } = input;
    await this.uniqueCuit(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.client.update({
          where: { id },
          data: {
            ...data,
            warehouses: warehouseIds ? { set: warehouseIds.map((w) => ({ id: w })) } : undefined,
          },
        });
        await this.audit.log(
          {
            action: 'client.updated',
            actorId: actor.user.id,
            entityType: 'client',
            entityId: id,
            ip: meta.ip,
            metadata: { fields: Object.keys(input) },
          },
          tx,
        );
      }),
    );
    return this.get(id, actor);
  }

  async saveContact(
    clientId: string,
    contactId: string | null,
    input: ContactParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ClientDetail> {
    const exists = await this.prisma.client.count({ where: { id: clientId } });
    if (!exists) throw new NotFoundException('Cliente inexistente');
    const data = {
      kind: input.kind,
      role: input.role ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    };
    if (contactId) {
      const { count } = await this.prisma.clientContact.updateMany({
        where: { id: contactId, clientId },
        data,
      });
      if (!count) throw new NotFoundException('Contacto inexistente');
    } else {
      await this.prisma.clientContact.create({ data: { ...data, clientId } });
    }
    await this.audit.log({
      action: 'client.contact.changed',
      actorId: actor.user.id,
      entityType: 'client',
      entityId: clientId,
      ip: meta.ip,
      metadata: { contactId, change: contactId ? 'updated' : 'created' },
    });
    return this.get(clientId, actor);
  }

  async deleteContact(
    clientId: string,
    contactId: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ClientDetail> {
    const { count } = await this.prisma.clientContact.deleteMany({
      where: { id: contactId, clientId },
    });
    if (!count) throw new NotFoundException('Contacto inexistente');
    await this.audit.log({
      action: 'client.contact.changed',
      actorId: actor.user.id,
      entityType: 'client',
      entityId: clientId,
      ip: meta.ip,
      metadata: { contactId, change: 'deleted' },
    });
    return this.get(clientId, actor);
  }

  async addDocument(
    id: string,
    input: CreateDocumentParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ClientDetail> {
    const exists = await this.prisma.client.count({ where: { id } });
    if (!exists) throw new NotFoundException('Cliente inexistente');
    await this.documents.create({ type: 'CLIENT', id }, input, actor, meta);
    return this.get(id, actor);
  }
}
