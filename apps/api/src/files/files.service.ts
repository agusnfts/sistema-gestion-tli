import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type Attachment } from '@tli/db';
import { MAX_ATTACHMENT_BYTES, type AttachmentInfo } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobRegistry, QueueService } from '../queue/queue.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';
import { STORAGE, LocalStorage, type StorageProvider } from './storage';
import { ANTIVIRUS, type AntivirusScanner } from './antivirus';
import { detectFileType, isInlineSafe } from './file-type';

export type UploadedFile = { originalname: string; buffer: Buffer; size: number };

// Los adjuntos que nunca se vincularon (a un ticket, comentario o acción) se borran a las 24 h.
const ORPHAN_TTL_MS = 24 * 3600_000;

export type LinkTarget =
  | { ticketId: string; commentId?: string }
  | { problemActionId: string }
  | { improvementCommentId: string }
  | { integrationActionId: string }
  | { integrationQuoteId: string }
  | { documentVersionId: string };

const UNLINKED = {
  ticketId: null,
  commentId: null,
  problemActionId: null,
  improvementCommentId: null,
  integrationActionId: null,
  integrationQuoteId: null,
  documentVersionId: null,
} satisfies Prisma.AttachmentWhereInput;

/**
 * Un documento se ve si es público, si es interno y el actor ve la biblioteca interna, o si
 * está vinculado a algo que el actor puede ver (una integración o un cliente).
 */
function canSeeDocument(
  doc: { visibility: 'PUBLIC' | 'INTERNAL'; links: { entityType: string }[] },
  actor: AuthContext,
): boolean {
  const p = actor.permissions;
  if (doc.visibility === 'PUBLIC' && p.has('kb.read.public')) return true;
  if (p.has('kb.read.internal')) return true;
  return doc.links.some(
    (l) =>
      (l.entityType === 'INTEGRATION' && p.has('integration.read')) ||
      (l.entityType === 'CLIENT' && p.has('client.read')),
  );
}

export function toAttachmentInfo(
  a: Pick<Attachment, 'id' | 'originalName' | 'sizeBytes' | 'mimeType' | 'scanStatus'>,
): AttachmentInfo {
  return {
    id: a.id,
    name: a.originalName,
    size: a.sizeBytes,
    mimeType: a.mimeType,
    scanStatus: a.scanStatus,
  };
}

/** Nombre seguro para mostrar y para Content-Disposition. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f"<>|*?:]/g, '_').slice(0, 150) || 'archivo';
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
    private readonly jobs: JobRegistry,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(ANTIVIRUS) private readonly antivirus: AntivirusScanner,
  ) {}

  onModuleInit(): void {
    this.jobs.register('files.scan', (data) => this.scan(String(data.attachmentId)));
    this.jobs.register('maintenance.cleanup', async () => {
      await this.cleanupOrphans(new Date());
    });
  }

  async upload(file: UploadedFile | undefined, actor: AuthContext): Promise<AttachmentInfo> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío');
    if (file.size > MAX_ATTACHMENT_BYTES)
      throw new BadRequestException('El archivo supera los 25 MB');
    const type = detectFileType(file.buffer, file.originalname);
    if (!type) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Se aceptan imágenes, PDF, Word, Excel, ZIP y texto.',
      );
    }
    const id = randomUUID();
    const key = LocalStorage.keyFor('quarantine', id);
    await this.storage.put(key, file.buffer);
    const row = await this.prisma.attachment
      .create({
        data: {
          id,
          storageKey: key,
          originalName: cleanName(file.originalname),
          mimeType: type.mime,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedById: actor.user.id,
        },
      })
      .catch(async (err: unknown) => {
        await this.storage.delete(key);
        throw err;
      });
    // Ningún archivo se sirve hasta que el antivirus lo marque como limpio.
    await this.queue.add('files.scan', { attachmentId: id }, { attempts: 10 });
    const current = await this.prisma.attachment.findUnique({ where: { id } });
    return toAttachmentInfo(current ?? row);
  }

  /** Job del worker: analiza el archivo en cuarentena y lo libera o lo descarta. */
  async scan(id: string): Promise<void> {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a || a.scanStatus !== 'PENDING_SCAN') return;
    const result = await this.antivirus.scan(await this.storage.read(a.storageKey));
    if (result.clean) {
      const key = LocalStorage.keyFor('clean', a.id);
      await this.storage.move(a.storageKey, key);
      await this.prisma.attachment.update({
        where: { id },
        data: { storageKey: key, scanStatus: 'CLEAN', scannedAt: new Date() },
      });
      return;
    }
    await this.storage.delete(a.storageKey);
    await this.prisma.attachment.update({
      where: { id },
      data: { scanStatus: 'INFECTED', scanDetail: result.signature, scannedAt: new Date() },
    });
    await this.audit.log({
      action: 'file.infected',
      actorId: a.uploadedById,
      entityType: 'attachment',
      entityId: a.id,
      metadata: { signature: result.signature, sha256: a.sha256 },
    });
    const admins = await this.notifications.usersWithPermission('settings.manage');
    await this.notifications.notify([a.uploadedById, ...admins], {
      kind: 'FILE_INFECTED',
      title: 'Adjunto rechazado por el antivirus',
      body: `"${a.originalName}" fue eliminado (${result.signature}).`,
      entityType: 'attachment',
      entityId: a.id,
    });
    this.logger.warn(`Adjunto ${a.id} infectado: ${result.signature}`);
  }

  /**
   * Vincula adjuntos recién subidos a un ticket (y opcionalmente a un comentario) o a una
   * acción de un problema o una mejora. Solo los sube su autor, sin vincular y no rechazados
   * por el antivirus.
   */
  async link(
    ids: string[] | undefined,
    actor: AuthContext,
    target: LinkTarget,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const unique = [...new Set(ids ?? [])];
    if (!unique.length) return;
    const { count } = await tx.attachment.updateMany({
      where: {
        id: { in: unique },
        uploadedById: actor.user.id,
        ...UNLINKED,
        scanStatus: { not: 'INFECTED' },
      },
      data: target,
    });
    if (count !== unique.length)
      throw new BadRequestException('Algún adjunto no es válido o ya fue usado');
  }

  /** Abre un adjunto si el actor puede verlo. Si no, 404 (no revela que existe). */
  async open(id: string, actor: AuthContext, inline: boolean, meta: RequestMeta) {
    const a = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        ticket: { select: { requesterId: true } },
        comment: { select: { visibility: true } },
        documentVersion: {
          select: {
            document: { select: { visibility: true, links: { select: { entityType: true } } } },
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Adjunto inexistente');
    const isUploader = a.uploadedById === actor.user.id;
    const canSeeTicket =
      !!a.ticket &&
      (a.ticket.requesterId === actor.user.id || actor.permissions.has('ticket.read.all'));
    const canSeeComment =
      !a.comment ||
      a.comment.visibility === 'PUBLIC' ||
      actor.permissions.has('ticket.comment.internal');
    // Las acciones de problemas y mejoras son internas: alcanza con poder ver el módulo.
    const allowed = a.ticketId
      ? canSeeTicket && canSeeComment
      : a.problemActionId
        ? actor.permissions.has('problem.read')
        : a.improvementCommentId
          ? actor.permissions.has('improvement.read')
          : a.integrationActionId || a.integrationQuoteId
            ? actor.permissions.has('integration.read')
            : a.documentVersion
              ? canSeeDocument(a.documentVersion.document, actor)
              : isUploader;
    if (!allowed) throw new NotFoundException('Adjunto inexistente');
    if (a.scanStatus === 'PENDING_SCAN')
      throw new ConflictException('El archivo todavía se está analizando');
    if (a.scanStatus === 'INFECTED')
      throw new GoneException('El archivo fue rechazado por el antivirus');

    const asInline = inline && isInlineSafe(a.mimeType);
    if (!asInline) {
      await this.audit.log({
        action: 'file.downloaded',
        actorId: actor.user.id,
        entityType: 'attachment',
        entityId: a.id,
        ip: meta.ip,
        metadata: {
          ticketId: a.ticketId,
          problemActionId: a.problemActionId,
          improvementCommentId: a.improvementCommentId,
        },
      });
    }
    return {
      stream: this.storage.stream(a.storageKey),
      mimeType: a.mimeType,
      size: a.sizeBytes,
      name: a.originalName,
      inline: asInline,
    };
  }

  /** Estado actual de adjuntos propios (para que la web muestre el avance del análisis). */
  async statusOf(ids: string[], actor: AuthContext): Promise<AttachmentInfo[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { id: { in: ids.slice(0, 20) }, uploadedById: actor.user.id },
    });
    return rows.map(toAttachmentInfo);
  }

  async cleanupOrphans(now: Date): Promise<number> {
    const orphans = await this.prisma.attachment.findMany({
      where: {
        ...UNLINKED,
        createdAt: { lt: new Date(now.getTime() - ORPHAN_TTL_MS) },
      },
      take: 500,
    });
    for (const a of orphans) {
      await this.storage.delete(a.storageKey).catch(() => undefined);
      await this.prisma.attachment.delete({ where: { id: a.id } });
    }
    return orphans.length;
  }
}
