import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  formatIntegrationCode,
  type LibraryDocument,
  type LibraryDocumentParsed,
  type ListLibraryQuery,
  type Paginated,
  type UpdateLibraryDocumentInput,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService, toAttachmentInfo } from '../files/files.service';
import { IndexingService } from './indexing.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const include = {
  author: { select: { id: true, fullName: true } },
  currentVersion: { include: { attachment: true } },
  links: true,
  _count: { select: { versions: true } },
} satisfies Prisma.DocumentInclude;
type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof include }>;

/** Qué documentos de la biblioteca ve cada uno (mismo criterio que la descarga del archivo). */
export function documentVisibilityWhere(actor: AuthContext): Prisma.DocumentWhereInput {
  const p = actor.permissions;
  if (p.has('kb.read.internal')) return {};
  const or: Prisma.DocumentWhereInput[] = [];
  if (p.has('kb.read.public')) or.push({ visibility: 'PUBLIC' });
  if (p.has('integration.read')) or.push({ links: { some: { entityType: 'INTEGRATION' } } });
  if (p.has('client.read')) or.push({ links: { some: { entityType: 'CLIENT' } } });
  return or.length ? { OR: or } : { id: { in: [] } };
}

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly indexing: IndexingService,
  ) {}

  /** Nombre legible de lo que está vinculado al documento (cliente o integración). */
  private async linkLabels(rows: DocumentRow[]): Promise<Map<string, string>> {
    const ids = (type: string) =>
      rows.flatMap((d) => d.links.filter((l) => l.entityType === type).map((l) => l.entityId));
    const [integrations, clients] = await Promise.all([
      this.prisma.integration.findMany({
        where: { id: { in: ids('INTEGRATION') } },
        select: { id: true, number: true, name: true },
      }),
      this.prisma.client.findMany({
        where: { id: { in: ids('CLIENT') } },
        select: { id: true, legalName: true, shortName: true },
      }),
    ]);
    return new Map([
      ...integrations.map((i) => [i.id, `${formatIntegrationCode(i.number)} · ${i.name}`] as const),
      ...clients.map((c) => [c.id, c.shortName ?? c.legalName] as const),
    ]);
  }

  private toItem(d: DocumentRow, labels: Map<string, string>): LibraryDocument {
    const v = d.currentVersion;
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      category: d.category,
      system: d.system,
      visibility: d.visibility,
      tags: d.tags,
      author: d.author,
      updatedAt: d.updatedAt.toISOString(),
      current: v
        ? {
            id: v.id,
            version: v.version,
            file: v.attachment ? toAttachmentInfo(v.attachment) : null,
            extractionStatus: v.extractionStatus,
            extractionDetail: v.extractionDetail,
            ocrUsed: v.ocrUsed,
            pagesWithoutText: v.pagesWithoutText,
            pageCount: v.pageCount,
          }
        : null,
      versionCount: d._count.versions,
      links: d.links.map((l) => ({
        entityType: l.entityType,
        entityId: l.entityId,
        label: labels.get(l.entityId) ?? l.entityType,
      })),
    };
  }

  async list(q: ListLibraryQuery, actor: AuthContext): Promise<Paginated<LibraryDocument>> {
    const and: Prisma.DocumentWhereInput[] = [
      documentVisibilityWhere(actor),
      { category: q.category, tags: q.tag ? { has: q.tag } : undefined },
    ];
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
          { tags: { has: q.q.toLowerCase() } },
        ],
      });
    }
    const where = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const labels = await this.linkLabels(rows);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => this.toItem(r, labels)),
    };
  }

  async get(id: string, actor: AuthContext): Promise<LibraryDocument> {
    const d = await this.prisma.document.findFirst({
      where: { AND: [{ id }, documentVisibilityWhere(actor)] },
      include,
    });
    if (!d) throw new NotFoundException('Documento inexistente');
    return this.toItem(d, await this.linkLabels([d]));
  }

  async create(
    input: LibraryDocumentParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<LibraryDocument> {
    if (input.visibility === 'PUBLIC' && !actor.permissions.has('kb.publish')) {
      throw new ForbiddenException('No podés publicar documentos para todos');
    }
    const versionId = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          system: input.system ?? null,
          visibility: input.visibility,
          tags: input.tags,
          authorId: actor.user.id,
        },
      });
      const v = await tx.documentVersion.create({
        data: { documentId: doc.id, version: 1, uploadedById: actor.user.id },
      });
      await this.files.link([input.attachmentId], actor, { documentVersionId: v.id }, tx);
      await tx.document.update({ where: { id: doc.id }, data: { currentVersionId: v.id } });
      await this.audit.log(
        {
          action: 'document.created',
          actorId: actor.user.id,
          entityType: 'document',
          entityId: doc.id,
          ip: meta.ip,
          metadata: { library: true, visibility: input.visibility },
        },
        tx,
      );
      return v.id;
    });
    await this.indexing.requestExtraction(versionId);
    const v = await this.prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    return this.get(v.documentId, actor);
  }

  async update(
    id: string,
    input: UpdateLibraryDocumentInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<LibraryDocument> {
    const d = await this.prisma.document.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Documento inexistente');
    if (
      input.visibility &&
      input.visibility !== d.visibility &&
      !actor.permissions.has('kb.publish')
    ) {
      throw new ForbiddenException('No podés cambiar la visibilidad');
    }
    await this.prisma.document.update({ where: { id }, data: input });
    if (input.visibility && input.visibility !== d.visibility) {
      await this.indexing.setDocumentVisibility(id, input.visibility);
    }
    await this.audit.log({
      action: 'document.updated',
      actorId: actor.user.id,
      entityType: 'document',
      entityId: id,
      ip: meta.ip,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(id, actor);
  }

  /** Reintenta la extracción de la versión vigente (por ejemplo, después de instalar OCR). */
  async reindex(id: string, actor: AuthContext): Promise<LibraryDocument> {
    const d = await this.prisma.document.findUnique({ where: { id } });
    if (!d?.currentVersionId) throw new NotFoundException('Documento inexistente');
    await this.prisma.documentVersion.update({
      where: { id: d.currentVersionId },
      data: { extractionStatus: 'PENDING', extractionDetail: null },
    });
    await this.indexing.requestExtraction(d.currentVersionId);
    return this.get(id, actor);
  }
}
