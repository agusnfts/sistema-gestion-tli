import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@tli/db';
import { PrismaService } from '../prisma/prisma.service';
import { JobRegistry, QueueService } from '../queue/queue.service';
import { STORAGE, type StorageProvider } from '../files/storage';
import { htmlToPlainText } from '../common/rich-text';
import { chunkPages, type PageText } from './chunking';
import { extractText } from './extract';

type Visibility = 'PUBLIC' | 'INTERNAL';

/**
 * Mantiene la tabla ContentChunk (búsqueda hoy, IA mañana: ADR 0011). Solo se indexa la
 * versión vigente de cada artículo o documento; al cambiar, los fragmentos se reemplazan
 * completos en una transacción.
 */
@Injectable()
export class IndexingService implements OnModuleInit {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly jobs: JobRegistry,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  onModuleInit(): void {
    this.jobs.register('documents.extract', (data) =>
      this.extractDocumentVersion(String(data.documentVersionId)),
    );
  }

  private async replace(
    tx: Prisma.TransactionClient,
    where: Prisma.ContentChunkWhereInput,
    owner: Pick<
      Prisma.ContentChunkUncheckedCreateInput,
      'sourceType' | 'articleVersionId' | 'documentVersionId' | 'integrationId'
    >,
    pages: PageText[],
    visibility: Visibility,
  ): Promise<number> {
    await tx.contentChunk.deleteMany({ where });
    const chunks = chunkPages(pages);
    if (chunks.length) {
      await tx.contentChunk.createMany({
        data: chunks.map((c) => ({ ...owner, ...c, visibility })),
      });
    }
    return chunks.length;
  }

  /** Reindexa la versión vigente de un artículo (y borra los fragmentos de las anteriores). */
  async indexArticle(articleId: string): Promise<void> {
    const a = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { currentVersion: true, versions: { select: { id: true } } },
    });
    if (!a?.currentVersion) return;
    const v = a.currentVersion;
    const text = [
      v.title,
      htmlToPlainText(v.body),
      v.errorSymptom && `Síntoma: ${v.errorSymptom}`,
      v.errorCause && `Causa: ${v.errorCause}`,
      v.errorSolution && `Solución: ${v.errorSolution}`,
      v.errorSteps && `Pasos: ${v.errorSteps}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    await this.prisma.$transaction((tx) =>
      this.replace(
        tx,
        { articleVersionId: { in: a.versions.map((x) => x.id) } },
        { sourceType: 'ARTICLE', articleVersionId: v.id },
        [{ page: null, text }],
        a.visibility,
      ),
    );
  }

  /** "Cómo funciona" de una integración: siempre interno. */
  async indexIntegration(integrationId: string): Promise<void> {
    const i = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!i) return;
    await this.prisma.$transaction((tx) =>
      this.replace(
        tx,
        { integrationId },
        { sourceType: 'INTEGRATION', integrationId },
        [{ page: null, text: `${i.name}\n\n${htmlToPlainText(i.howItWorks)}` }],
        'INTERNAL',
      ),
    );
  }

  /** Encola la extracción si el archivo ya está limpio (si no, la dispara el antivirus). */
  async requestExtraction(documentVersionId: string): Promise<void> {
    const v = await this.prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      include: { attachment: { select: { scanStatus: true } } },
    });
    if (v?.attachment?.scanStatus === 'CLEAN') {
      await this.queue.add('documents.extract', { documentVersionId }, { attempts: 3 });
    }
  }

  async setDocumentVisibility(documentId: string, visibility: Visibility): Promise<void> {
    await this.prisma.contentChunk.updateMany({
      where: { documentVersion: { documentId } },
      data: { visibility },
    });
  }

  /** Job del worker: extrae el texto de una versión de documento y la indexa. */
  async extractDocumentVersion(id: string): Promise<void> {
    const v = await this.prisma.documentVersion.findUnique({
      where: { id },
      include: {
        attachment: true,
        document: { include: { versions: { select: { id: true } } } },
      },
    });
    if (!v?.attachment || v.attachment.scanStatus !== 'CLEAN') return;
    if (v.extractionStatus === 'DONE' || v.extractionStatus === 'SKIPPED') return;
    // Solo se busca sobre la versión vigente; las anteriores quedan en el historial.
    if (v.document.currentVersionId !== v.id) {
      await this.prisma.documentVersion.update({
        where: { id },
        data: { extractionStatus: 'SKIPPED', extractionDetail: 'Versión reemplazada' },
      });
      return;
    }
    try {
      const file = await this.storage.read(v.attachment.storageKey);
      const r = await extractText(file, v.attachment.mimeType);
      await this.prisma.$transaction(async (tx) => {
        await this.replace(
          tx,
          { documentVersionId: { in: v.document.versions.map((x) => x.id) } },
          { sourceType: 'DOCUMENT', documentVersionId: v.id },
          [{ page: null, text: v.document.title }, ...r.pages],
          v.document.visibility,
        );
        await tx.documentVersion.update({
          where: { id },
          data: {
            extractionStatus: r.skipped ? 'SKIPPED' : 'DONE',
            extractionDetail: null,
            ocrUsed: r.ocrUsed,
            pagesWithoutText: r.pagesWithoutText,
            pageCount: r.pageCount,
          },
        });
      });
    } catch (err) {
      this.logger.warn(`No se pudo extraer el texto de la versión ${id}: ${String(err)}`);
      await this.prisma.documentVersion.update({
        where: { id },
        data: {
          extractionStatus: 'FAILED',
          extractionDetail: err instanceof Error ? err.message.slice(0, 300) : 'Error',
        },
      });
    }
  }
}
