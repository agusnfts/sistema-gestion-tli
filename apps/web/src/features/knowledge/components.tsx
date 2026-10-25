import { Fragment } from 'react';
import {
  ARTICLE_STATUS_LABELS,
  EXTRACTION_STATUS_LABELS,
  type ArticleStatus,
  type ExtractionStatus,
  type KnowledgeVisibility,
} from '@tli/shared';
import { Badge } from '@/components/ui/misc';

const STATUS_TONES: Record<ArticleStatus, 'neutral' | 'success' | 'warning'> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export function ArticleStatusBadge({ status }: { status: ArticleStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{ARTICLE_STATUS_LABELS[status]}</Badge>;
}

export function VisibilityBadge({ visibility }: { visibility: KnowledgeVisibility }) {
  return visibility === 'PUBLIC' ? <Badge tone="info">Público</Badge> : <Badge>Interno</Badge>;
}

const EXTRACTION_TONES: Record<
  ExtractionStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  PENDING: 'info',
  DONE: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
};

export function ExtractionBadge({
  status,
  ocrUsed,
  pagesWithoutText,
}: {
  status: ExtractionStatus;
  ocrUsed?: boolean;
  pagesWithoutText?: number;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={EXTRACTION_TONES[status]}>{EXTRACTION_STATUS_LABELS[status]}</Badge>
      {ocrUsed && <Badge tone="info">Texto extraído por OCR</Badge>}
      {!!pagesWithoutText && (
        <Badge tone="warning">
          {pagesWithoutText} pág. escaneada{pagesWithoutText > 1 ? 's' : ''} sin leer
        </Badge>
      )}
    </span>
  );
}

/** Fragmento de búsqueda: los términos vienen marcados entre « ». */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(/«|»/);
  return (
    <p className="text-sm text-muted">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i % 2 ? <mark className="rounded bg-accent/25 px-0.5 text-fg">{p}</mark> : p}
        </Fragment>
      ))}
    </p>
  );
}

/** "Etiqueta uno, otra etiqueta" → lista normalizada. */
export function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2),
    ),
  ];
}
