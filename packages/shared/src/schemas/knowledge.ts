import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import type { AttachmentInfo, UserRef } from './tickets';
import { DOCUMENT_LINK_TYPES } from './documents';

// Base de conocimiento (Fase 6): artículos con versiones, biblioteca de documentos y
// búsqueda sobre fragmentos de texto (ADR 0011).

export const KNOWLEDGE_CATEGORIES = [
  'WMS',
  'TMS',
  'INTEGRATIONS',
  'PROCEDURES',
  'FREQUENT_ERRORS',
  'OTHER',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  WMS: 'WMS',
  TMS: 'TMS',
  INTEGRATIONS: 'Integraciones',
  PROCEDURES: 'Procedimientos',
  FREQUENT_ERRORS: 'Errores frecuentes',
  OTHER: 'Otros',
};

export const ARTICLE_TEMPLATES = ['FREE', 'ERROR_SHEET'] as const;
export type ArticleTemplate = (typeof ARTICLE_TEMPLATES)[number];
export const ARTICLE_TEMPLATE_LABELS: Record<ArticleTemplate, string> = {
  FREE: 'Artículo libre',
  ERROR_SHEET: 'Ficha de error',
};

export const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

export const VISIBILITIES = ['INTERNAL', 'PUBLIC'] as const;
export type KnowledgeVisibility = (typeof VISIBILITIES)[number];
export const VISIBILITY_LABELS: Record<KnowledgeVisibility, string> = {
  INTERNAL: 'Interno (solo IT)',
  PUBLIC: 'Público (todos los usuarios)',
};

export const EXTRACTION_STATUSES = ['PENDING', 'DONE', 'FAILED', 'SKIPPED'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];
export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  PENDING: 'Procesando',
  DONE: 'Texto indexado',
  FAILED: 'No se pudo leer',
  SKIPPED: 'Sin texto (imagen u otro formato)',
};

export function formatArticleCode(n: number): string {
  return `KB-${String(n).padStart(4, '0')}`;
}

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, 'Etiqueta inválida');
const tags = z
  .array(tag)
  .max(15)
  .transform((v) => [...new Set(v)]);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

/** Contenido de una versión. El cuerpo es HTML: el servidor lo sanitiza siempre. */
const articleContent = {
  title: z.string().trim().min(5, 'Poné un título claro').max(200),
  body: z.string().max(200_000).default(''),
  errorSymptom: optionalText(10_000),
  errorCause: optionalText(10_000),
  errorSolution: optionalText(10_000),
  errorSteps: optionalText(20_000),
};

export const createArticleSchema = z.object({
  ...articleContent,
  category: z.enum(KNOWLEDGE_CATEGORIES, { error: 'Elegí una categoría' }),
  template: z.enum(ARTICLE_TEMPLATES).default('FREE'),
  visibility: z.enum(VISIBILITIES).default('INTERNAL'),
  tags: tags.default([]),
  /** Artículo generado a partir de un ticket o un problema resuelto. */
  sourceTicketId: uuidSchema.nullable().optional(),
  sourceProblemId: uuidSchema.nullable().optional(),
});
export type CreateArticleInput = z.input<typeof createArticleSchema>;
export type CreateArticleParsed = z.output<typeof createArticleSchema>;

/** Guardar crea una versión nueva con el contenido completo. */
export const saveArticleSchema = z.object({
  ...articleContent,
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  tags: tags.optional(),
});
export type SaveArticleInput = z.input<typeof saveArticleSchema>;
export type SaveArticleParsed = z.output<typeof saveArticleSchema>;

export const articleStatusSchema = z.object({ status: z.enum(ARTICLE_STATUSES) });

export const listArticlesQuerySchema = paginationSchema.extend({
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
  status: z.enum(ARTICLE_STATUSES).optional(),
  tag: z.string().trim().toLowerCase().max(40).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;

// --- Biblioteca ---------------------------------------------------------------

export const libraryDocumentSchema = z.object({
  title: z.string().trim().min(2, 'Poné un título').max(200),
  description: optionalText(2000),
  category: z.enum(KNOWLEDGE_CATEGORIES).default('OTHER'),
  system: optionalText(40),
  visibility: z.enum(VISIBILITIES).default('INTERNAL'),
  tags: tags.default([]),
  linkType: z.enum(DOCUMENT_LINK_TYPES).default('MANUAL'),
  attachmentId: uuidSchema,
});
export type LibraryDocumentInput = z.input<typeof libraryDocumentSchema>;
export type LibraryDocumentParsed = z.output<typeof libraryDocumentSchema>;

export const updateLibraryDocumentSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: optionalText(2000),
    category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
    system: optionalText(40),
    visibility: z.enum(VISIBILITIES).optional(),
    tags: tags.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios');
export type UpdateLibraryDocumentInput = z.output<typeof updateLibraryDocumentSchema>;

export const listLibraryQuerySchema = paginationSchema.extend({
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
  tag: z.string().trim().toLowerCase().max(40).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>;

// --- Búsqueda -----------------------------------------------------------------

export const knowledgeSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Escribí al menos 2 letras').max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type KnowledgeSearchQuery = z.infer<typeof knowledgeSearchQuerySchema>;

export type SearchHit = {
  source: 'ARTICLE' | 'DOCUMENT' | 'INTEGRATION';
  /** Artículo, documento o integración. */
  id: string;
  title: string;
  code: string | null;
  pageNumber: number | null;
  /** Fragmento con los términos marcados entre « ». */
  snippet: string;
  rank: number;
  /** Para documentos: el archivo vigente, para abrirlo en la página citada. */
  fileId: string | null;
};

// --- Respuestas -------------------------------------------------------------------

export type ArticleListItem = {
  id: string;
  code: string;
  title: string;
  category: KnowledgeCategory;
  template: ArticleTemplate;
  visibility: KnowledgeVisibility;
  status: ArticleStatus;
  tags: string[];
  author: UserRef;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
};

export type ArticleVersionContent = {
  id: string;
  version: number;
  title: string;
  body: string;
  errorSymptom: string | null;
  errorCause: string | null;
  errorSolution: string | null;
  errorSteps: string | null;
  author: UserRef;
  createdAt: string;
};

export type ArticleDetail = ArticleListItem & {
  current: ArticleVersionContent;
  /** Historial (sin el cuerpo, para no traer todo): de la más nueva a la más vieja. */
  history: { id: string; version: number; title: string; author: UserRef; createdAt: string }[];
  source: {
    ticket: { id: string; number: string } | null;
    problem: { id: string; code: string } | null;
  };
  canEdit: boolean;
};

export type LibraryDocument = {
  id: string;
  title: string;
  description: string | null;
  category: KnowledgeCategory;
  system: string | null;
  visibility: KnowledgeVisibility;
  tags: string[];
  author: UserRef;
  updatedAt: string;
  current: {
    id: string;
    version: number;
    file: AttachmentInfo | null;
    extractionStatus: ExtractionStatus;
    extractionDetail: string | null;
    ocrUsed: boolean;
    pagesWithoutText: number;
    pageCount: number | null;
  } | null;
  versionCount: number;
  /** A qué está vinculado (cliente, integración…), si corresponde. */
  links: { entityType: string; entityId: string; label: string }[];
};
