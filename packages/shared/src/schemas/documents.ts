import { z } from 'zod';
import { uuidSchema } from './common';
import type { AttachmentInfo, UserRef } from './tickets';

// Biblioteca básica (Fase 5): documentos con versiones, vinculados a clientes e integraciones.
// La extracción de texto, el OCR y la búsqueda dentro de los documentos llegan en la Fase 6.

export const DOCUMENT_LINK_TYPES = [
  'SPECIFICATION',
  'LAYOUT',
  'SAMPLE_FILE',
  'MINUTES',
  'QUOTE',
  'MANUAL',
  'OTHER',
] as const;
export type DocumentLinkType = (typeof DOCUMENT_LINK_TYPES)[number];
export const DOCUMENT_LINK_TYPE_LABELS: Record<DocumentLinkType, string> = {
  SPECIFICATION: 'Especificación',
  LAYOUT: 'Layout / diseño de archivo',
  SAMPLE_FILE: 'Archivo de ejemplo',
  MINUTES: 'Minuta / acta',
  QUOTE: 'Cotización',
  MANUAL: 'Manual',
  OTHER: 'Otro',
};

/** Entidades que pueden tener documentos en esta fase. */
export const DOCUMENT_ENTITIES = ['CLIENT', 'INTEGRATION'] as const;
export type DocumentEntity = (typeof DOCUMENT_ENTITIES)[number];

export const createDocumentSchema = z.object({
  title: z.string().trim().min(2, 'Poné un título').max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  linkType: z.enum(DOCUMENT_LINK_TYPES).default('OTHER'),
  /** Archivo ya subido (pasa por el antivirus como cualquier adjunto). */
  attachmentId: uuidSchema,
});
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;
export type CreateDocumentParsed = z.output<typeof createDocumentSchema>;

export const newDocumentVersionSchema = z.object({
  attachmentId: uuidSchema,
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});
export type NewDocumentVersionInput = z.input<typeof newDocumentVersionSchema>;

export type DocumentVersionItem = {
  id: string;
  version: number;
  note: string | null;
  file: AttachmentInfo | null;
  extractionStatus: 'PENDING' | 'DONE' | 'FAILED' | 'SKIPPED';
  ocrUsed: boolean;
  pagesWithoutText: number;
  pageCount: number | null;
  uploadedBy: UserRef;
  createdAt: string;
};

export type DocumentItem = {
  id: string;
  title: string;
  description: string | null;
  linkType: DocumentLinkType;
  current: DocumentVersionItem | null;
  /** Todas las versiones, de la más nueva a la más vieja. */
  versions: DocumentVersionItem[];
  updatedAt: string;
};
