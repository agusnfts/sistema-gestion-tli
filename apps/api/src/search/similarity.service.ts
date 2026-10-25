import { Global, Injectable, Module } from '@nestjs/common';
import {
  formatProblemCode,
  formatTicketNumber,
  type ProblemStatus,
  type SimilarResults,
  type TicketStatus,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';

type TicketRow = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  createdAt: Date;
  requesterId: string;
  requesterName: string;
  problemId: string | null;
  problemNumber: number | null;
  problemTitle: string | null;
  problemStatus: ProblemStatus | null;
  score: number;
};

type ProblemRow = {
  id: string;
  number: number;
  title: string;
  status: ProblemStatus;
  ticketCount: bigint;
  score: number;
};

// Umbral de similitud de trigramas para considerar dos asuntos parecidos aunque no compartan palabras.
const TRIGRAM_THRESHOLD = 0.3;
const LIMIT = 5;

/**
 * Sugerencias por similitud de texto (ADR 0005): búsqueda full-text en español sin acentos
 * (cualquier palabra del texto, ponderada por relevancia) más similitud de trigramas del asunto.
 * Solo sugiere: la vinculación la decide siempre una persona de IT.
 */
@Injectable()
export class SimilarityService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    input: { title: string; body: string },
    exclude: { ticketIds?: string[]; problemId?: string } = {},
  ): Promise<SimilarResults> {
    // Consulta OR con las palabras (ya normalizadas) del título y el comienzo del cuerpo.
    const text = `${input.title} ${input.body.slice(0, 500)}`;
    const excludeTickets = exclude.ticketIds?.length
      ? exclude.ticketIds
      : ['00000000-0000-0000-0000-000000000000'];

    const tickets = await this.prisma.$queryRaw<TicketRow[]>`
      WITH src AS (
        SELECT to_tsquery('tli_spanish', string_agg(DISTINCT quote_literal(lexeme), ' | ')) AS q
        FROM unnest(tsvector_to_array(to_tsvector('tli_spanish', ${text}))) AS lexeme
      )
      SELECT t.id, t.number, t.subject, t.status, t."createdAt", t."requesterId",
             u."fullName" AS "requesterName", t."problemId",
             p.number AS "problemNumber", p.title AS "problemTitle", p.status AS "problemStatus",
             (coalesce(ts_rank(t."searchVector", src.q), 0) + similarity(t.subject, ${input.title}))::float AS score
      FROM "Ticket" t
      CROSS JOIN src
      JOIN "User" u ON u.id = t."requesterId"
      LEFT JOIN "Problem" p ON p.id = t."problemId"
      WHERE t.id <> ALL(${excludeTickets}::uuid[])
        AND (t."searchVector" @@ src.q OR similarity(t.subject, ${input.title}) > ${TRIGRAM_THRESHOLD})
      ORDER BY score DESC
      LIMIT ${LIMIT}`;

    const problems = await this.prisma.$queryRaw<ProblemRow[]>`
      WITH src AS (
        SELECT to_tsquery('tli_spanish', string_agg(DISTINCT quote_literal(lexeme), ' | ')) AS q
        FROM unnest(tsvector_to_array(to_tsvector('tli_spanish', ${text}))) AS lexeme
      )
      SELECT p.id, p.number, p.title, p.status,
             (SELECT count(*) FROM "Ticket" t WHERE t."problemId" = p.id) AS "ticketCount",
             (coalesce(ts_rank(p."searchVector", src.q), 0) + similarity(p.title, ${input.title}))::float AS score
      FROM "Problem" p
      CROSS JOIN src
      WHERE p.id::text <> ${exclude.problemId ?? ''}
        AND (p."searchVector" @@ src.q OR similarity(p.title, ${input.title}) > ${TRIGRAM_THRESHOLD})
      -- Primero los problemas abiertos: es donde tiene sentido vincular.
      ORDER BY (p.status = 'RESOLVED'), score DESC
      LIMIT ${LIMIT}`;

    return {
      tickets: tickets.map((t) => ({
        id: t.id,
        number: formatTicketNumber(t.number),
        subject: t.subject,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        requester: { id: t.requesterId, fullName: t.requesterName },
        score: Math.round(t.score * 100) / 100,
        problem:
          t.problemId && t.problemNumber !== null
            ? {
                id: t.problemId,
                code: formatProblemCode(t.problemNumber),
                title: t.problemTitle ?? '',
                status: t.problemStatus ?? 'OPEN',
              }
            : null,
      })),
      problems: problems.map((p) => ({
        id: p.id,
        code: formatProblemCode(p.number),
        title: p.title,
        status: p.status,
        ticketCount: Number(p.ticketCount),
        score: Math.round(p.score * 100) / 100,
      })),
    };
  }
}

@Global()
@Module({ providers: [SimilarityService], exports: [SimilarityService] })
export class SearchModule {}
