import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  BUSINESS_SYSTEMS,
  type BusinessSystem,
  type DistributionListInput,
  type DistributionListItem,
  type SystemInfoItem,
  type UpdateDistributionListInput,
  type UpdateSystemInfoInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const listSelect = { id: true, name: true, description: true, emails: true, active: true };

/** Catálogo de Sistemas (con su proveedor) y listas de distribución de avisos. */
@Injectable()
export class SystemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listSystems(): Promise<SystemInfoItem[]> {
    const rows = await this.prisma.systemInfo.findMany({
      include: { provider: { select: { id: true, name: true } } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    // Siempre los cuatro, en el orden de siempre (aunque falte correr el seed).
    return BUSINESS_SYSTEMS.map((key) => ({
      key,
      provider: byKey.get(key)?.provider ?? null,
      notes: byKey.get(key)?.notes ?? null,
    }));
  }

  /** Proveedor que se propone al crear una mejora de ese sistema. */
  async providerOf(system: string): Promise<string | null> {
    if (!(BUSINESS_SYSTEMS as readonly string[]).includes(system)) return null;
    const row = await this.prisma.systemInfo.findUnique({
      where: { key: system as BusinessSystem },
      select: { providerId: true },
    });
    return row?.providerId ?? null;
  }

  async updateSystem(
    key: BusinessSystem,
    input: UpdateSystemInfoInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<SystemInfoItem> {
    if (input.providerId) {
      const provider = await this.prisma.provider.findUnique({ where: { id: input.providerId } });
      if (!provider) throw new BadRequestException('Proveedor inexistente');
    }
    await this.prisma.systemInfo.upsert({
      where: { key },
      create: { key, providerId: input.providerId ?? null, notes: input.notes ?? null },
      update: { providerId: input.providerId, notes: input.notes },
    });
    await this.audit.log({
      action: 'system.updated',
      actorId: actor.user.id,
      entityType: 'system',
      entityId: key,
      ip: meta.ip,
      metadata: { fields: Object.keys(input) },
    });
    return (await this.listSystems()).find((s) => s.key === key)!;
  }

  listDistributionLists(includeInactive: boolean): Promise<DistributionListItem[]> {
    return this.prisma.distributionList.findMany({
      where: includeInactive ? undefined : { active: true },
      select: listSelect,
      orderBy: { name: 'asc' },
    });
  }

  async createDistributionList(
    input: DistributionListInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<DistributionListItem> {
    const list = await this.uniqueName(() =>
      this.prisma.distributionList.create({
        data: { ...input, description: input.description ?? null },
        select: listSelect,
      }),
    );
    await this.audit.log({
      action: 'distribution_list.created',
      actorId: actor.user.id,
      entityType: 'distribution_list',
      entityId: list.id,
      ip: meta.ip,
      // Solo la cantidad: los mails no van a la auditoría.
      metadata: { name: list.name, emailCount: list.emails.length },
    });
    return list;
  }

  async updateDistributionList(
    id: string,
    input: UpdateDistributionListInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<DistributionListItem> {
    if (!(await this.prisma.distributionList.findUnique({ where: { id } }))) {
      throw new NotFoundException('Lista inexistente');
    }
    const list = await this.uniqueName(() =>
      this.prisma.distributionList.update({ where: { id }, data: input, select: listSelect }),
    );
    await this.audit.log({
      action: 'distribution_list.updated',
      actorId: actor.user.id,
      entityType: 'distribution_list',
      entityId: id,
      ip: meta.ip,
      metadata: { fields: Object.keys(input), emailCount: list.emails.length },
    });
    return list;
  }

  private async uniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una lista con ese nombre');
      }
      throw e;
    }
  }
}
