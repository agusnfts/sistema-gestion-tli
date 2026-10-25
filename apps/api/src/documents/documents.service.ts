import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  type CreateDocumentParsed,
  type DocumentEntity,
  type DocumentItem,
  type NewDocumentVersionInput,
  type PermissionKey,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService, toAttachmentInfo } from '../files/files.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const userRef = { select: { id: true, fullName: true } } as const;
const versionInclude = {
  uploadedBy: userRef,
  attachment: true,
} satisfies Prisma.DocumentVersionInclude;
type VersionRow = Prisma.DocumentVersionGetPayload<{ include: typeof versionInclude }>;

/** Permiso para subir o versionar documentos de cada tipo de entidad. */
const MANAGE_PERMISSION: Record<DocumentEntity, PermissionKey> = {
  CLIENT: 'client.manage',
  INTEGRATION: 'integration.manage',
};

function toVersion(v: VersionRow) {
  return {
    id: v.id,
    version: v.version,
    note: v.note,
    file: v.attachment ? toAttachmentInfo(v.attachment) : null,
    uploadedBy: v.uploadedBy,
    createdAt: v.createdAt.toISOString(),
  };
}

/**
 * Biblioteca básica: documentos con versiones vinculados a clientes e integraciones. Cada
 * versión es un adjunto (validado por contenido y analizado por el antivirus).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  async listFor(entityType: DocumentEntity, entityId: string): Promise<DocumentItem[]> {
    const links = await this.prisma.documentLink.findMany({
      where: { entityType, entityId },
      include: {
        document: {
          include: { versions: { include: versionInclude, orderBy: { version: 'desc' } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return links.map(({ document: d, linkType }) => {
      const versions = d.versions.map(toVersion);
      return {
        id: d.id,
        title: d.title,
        description: d.description,
        linkType,
        current: versions.find((v) => v.id === d.currentVersionId) ?? versions[0] ?? null,
        versions,
        updatedAt: d.updatedAt.toISOString(),
      };
    });
  }

  async create(
    entity: { type: DocumentEntity; id: string },
    input: CreateDocumentParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          authorId: actor.user.id,
        },
      });
      const version = await tx.documentVersion.create({
        data: { documentId: doc.id, version: 1, uploadedById: actor.user.id },
      });
      await this.files.link([input.attachmentId], actor, { documentVersionId: version.id }, tx);
      await tx.document.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
      await tx.documentLink.create({
        data: {
          documentId: doc.id,
          entityType: entity.type,
          entityId: entity.id,
          linkType: input.linkType,
        },
      });
      await this.audit.log(
        {
          action: 'document.created',
          actorId: actor.user.id,
          entityType: 'document',
          entityId: doc.id,
          ip: meta.ip,
          metadata: { entityType: entity.type, entityId: entity.id, linkType: input.linkType },
        },
        tx,
      );
    });
  }

  /** Sube una versión nueva; queda como la vigente y las anteriores se conservan. */
  async addVersion(
    id: string,
    input: NewDocumentVersionInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { links: true, versions: { select: { version: true } } },
    });
    if (!doc) throw new NotFoundException('Documento inexistente');
    const canManage =
      actor.permissions.has('kb.manage') ||
      doc.links.some((l) => {
        const perm = MANAGE_PERMISSION[l.entityType as DocumentEntity];
        return perm && actor.permissions.has(perm);
      });
    if (!canManage) throw new ForbiddenException('No podés modificar este documento');

    const next = Math.max(0, ...doc.versions.map((v) => v.version)) + 1;
    await this.prisma.$transaction(async (tx) => {
      const version = await tx.documentVersion.create({
        data: {
          documentId: id,
          version: next,
          note: input.note ?? null,
          uploadedById: actor.user.id,
        },
      });
      await this.files.link([input.attachmentId], actor, { documentVersionId: version.id }, tx);
      await tx.document.update({ where: { id }, data: { currentVersionId: version.id } });
      await this.audit.log(
        {
          action: 'document.version.added',
          actorId: actor.user.id,
          entityType: 'document',
          entityId: id,
          ip: meta.ip,
          metadata: { version: next },
        },
        tx,
      );
    });
  }
}
