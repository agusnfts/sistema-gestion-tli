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

// Las tablas de catálogo comparten forma (id, name, active); plataformas suma la categoría.
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

const baseSelect = { id: true, name: true, active: true };
const selectFor = (kind: CatalogKind) =>
  kind === 'platforms' ? { ...baseSelect, category: true } : baseSelect;
/** La categoría solo existe en plataformas: en los otros catálogos se ignora. */
const dataFor = <T extends { category?: unknown }>(kind: CatalogKind, input: T) => {
  if (kind === 'platforms') return input;
  const { category: _category, ...rest } = input;
  return rest;
};

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
      platforms: this.prisma.platform,
    } as unknown as Record<CatalogKind, CatalogDelegate>;
    return map[kind];
  }

  list(kind: CatalogKind, includeInactive: boolean): Promise<CatalogItem[]> {
    return this.delegate(kind).findMany({
      where: includeInactive ? undefined : { active: true },
      select: selectFor(kind),
      orderBy: { name: 'asc' },
    });
  }

  async create(kind: CatalogKind, input: CatalogItemInput, actor: AuthContext, meta: RequestMeta) {
    const item = await this.delegate(kind).create({
      data: dataFor(kind, input) as CatalogItemInput,
      select: selectFor(kind),
    });
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
    const item = await d.update({
      where: { id },
      data: dataFor(kind, input),
      select: selectFor(kind),
    });
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
