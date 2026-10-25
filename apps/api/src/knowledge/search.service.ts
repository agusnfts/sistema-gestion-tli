import { Injectable } from '@nestjs/common';
import { formatArticleCode, formatIntegrationCode, type SearchHit } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from '../common/auth-context';

type Row = {
  sourceType: 'ARTICLE' | 'DOCUMENT' | 'INTEGRATION';
  pageNumber: number | null;
  rank: number;
  snippet: string;
  articleId: string | null;
  articleNumber: number | null;
  articleTitle: string | null;
  documentId: string | null;
  documentTitle: string | null;
  fileId: string | null;
  integrationId: string | null;
  integrationNumber: number | null;
  integrationName: string | null;
};

/**
 * Búsqueda full-text sobre ContentChunk (español sin acentos). La visibilidad y los permisos
 * se aplican en SQL, antes de traer nada: es el mismo filtro que usará la IA (ADR 0011).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, limit: number, actor: AuthContext): Promise<SearchHit[]> {
    const p = actor.permissions;
    const pub = p.has('kb.read.public');
    const internal = p.has('kb.read.internal');
    const manage = p.has('kb.manage');
    const integrations = p.has('integration.read');
    const clients = p.has('client.read');

    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH query AS (SELECT websearch_to_tsquery('tli_spanish', ${q}) AS q)
      SELECT c."sourceType", c."pageNumber",
             ts_rank(c."searchVector", query.q) AS rank,
             ts_headline('tli_spanish', c.text, query.q,
               'StartSel=«,StopSel=»,MaxFragments=2,MaxWords=28,MinWords=10,FragmentDelimiter= … ') AS snippet,
             a.id AS "articleId", a.number AS "articleNumber", av.title AS "articleTitle",
             d.id AS "documentId", d.title AS "documentTitle", att.id AS "fileId",
             i.id AS "integrationId", i.number AS "integrationNumber", i.name AS "integrationName"
      FROM "ContentChunk" c
      CROSS JOIN query
      LEFT JOIN "ArticleVersion" av ON av.id = c."articleVersionId"
      LEFT JOIN "Article" a ON a.id = av."articleId"
      LEFT JOIN "DocumentVersion" dv ON dv.id = c."documentVersionId"
      LEFT JOIN "Document" d ON d.id = dv."documentId"
      LEFT JOIN "Attachment" att ON att."documentVersionId" = dv.id AND att."scanStatus" = 'CLEAN'
      LEFT JOIN "Integration" i ON i.id = c."integrationId"
      WHERE c."searchVector" @@ query.q
        AND (
          (c."sourceType" = 'ARTICLE'
            AND (${manage} OR a.status = 'PUBLISHED')
            AND ((c.visibility = 'PUBLIC' AND ${pub}) OR ${internal}))
          OR (c."sourceType" = 'DOCUMENT'
            AND (
              (c.visibility = 'PUBLIC' AND ${pub}) OR ${internal}
              OR (${integrations} AND EXISTS (SELECT 1 FROM "DocumentLink" l
                    WHERE l."documentId" = d.id AND l."entityType" = 'INTEGRATION'))
              OR (${clients} AND EXISTS (SELECT 1 FROM "DocumentLink" l
                    WHERE l."documentId" = d.id AND l."entityType" = 'CLIENT'))))
          OR (c."sourceType" = 'INTEGRATION' AND ${integrations})
        )
      ORDER BY rank DESC
      LIMIT 200`;

    // Un resultado por artículo/integración, y por página en los documentos.
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const r of rows) {
      const id = r.articleId ?? r.documentId ?? r.integrationId;
      if (!id) continue;
      const key = r.sourceType === 'DOCUMENT' ? `${id}:${r.pageNumber}` : id;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        source: r.sourceType,
        id,
        title: r.articleTitle ?? r.documentTitle ?? r.integrationName ?? '',
        code:
          r.articleNumber !== null
            ? formatArticleCode(r.articleNumber)
            : r.integrationNumber !== null
              ? formatIntegrationCode(r.integrationNumber)
              : null,
        pageNumber: r.pageNumber,
        snippet: r.snippet,
        rank: Number(r.rank),
        fileId: r.fileId,
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }
}
