import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogKind,
  UpdateCatalogItemInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

// Las tres tablas de catálogo comparten forma (id, name, active).
type CatalogDelegate = {
  findMany(args: object): Promise<CatalogItem[]>;
  findUnique(args: { where: { id: string } }): Promise<CatalogItem | null>;
  create(args: { data: CatalogItemInput; select: object }): Promise<CatalogItem>;
  update(args: {
    where: { id: string };
    data: UpdateCatalogItemInput;
    select: object;
  }): Promise<CatalogItem>;
};

const select = { id: true, name: true, active: true };

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private delegate(kind: CatalogKind): CatalogDelegate {
    const map = {
      areas: this.prisma.area,
      warehouses: this.prisma.warehouse,
      providers: this.prisma.provider,
    } as unknown as Record<CatalogKind, CatalogDelegate>;
    return map[kind];
  }

  list(kind: CatalogKind, includeInactive: boolean): Promise<CatalogItem[]> {
    return this.delegate(kind).findMany({
      where: includeInactive ? undefined : { active: true },
      select,
      orderBy: { name: 'asc' },
    });
  }

  async create(kind: CatalogKind, input: CatalogItemInput, actor: AuthContext, meta: RequestMeta) {
    const item = await this.delegate(kind).create({ data: input, select });
    await this.audit.log({
      action: 'catalog.created',
      actorId: actor.user.id,
      entityType: kind,
      entityId: item.id,
      ip: meta.ip,
      metadata: { name: item.name },
    });
    return item;
  }

  async update(
    kind: CatalogKind,
    id: string,
    input: UpdateCatalogItemInput,
    actor: AuthContext,
    meta: RequestMeta,
  ) {
    const d = this.delegate(kind);
    if (!(await d.findUnique({ where: { id } }))) throw new NotFoundException('No encontrado');
    const item = await d.update({ where: { id }, data: input, select });
    await this.audit.log({
      action: 'catalog.updated',
      actorId: actor.user.id,
      entityType: kind,
      entityId: id,
      ip: meta.ip,
      metadata: { fields: Object.keys(input) },
    });
    return item;
  }
}
