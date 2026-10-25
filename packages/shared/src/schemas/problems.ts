import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import { TICKET_CATEGORIES, type TicketCategory, type TicketStatus } from '../tickets';
import type { TicketActivity, UserRef } from './tickets';
import type { ImprovementRef } from './improvements';
import type { WorkLogEntry } from './work-log';

export const PROBLEM_STATUSES = [
  'OPEN',
  'INVESTIGATING',
  'ROOT_CAUSE_IDENTIFIED',
  'RESOLVED',
] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export const PROBLEM_STATUS_LABELS: Record<ProblemStatus, string> = {
  OPEN: 'Abierto',
  INVESTIGATING: 'En investigación',
  ROOT_CAUSE_IDENTIFIED: 'Causa identificada',
  RESOLVED: 'Resuelto',
};

export function formatProblemCode(n: number): string {
  return `PRB-${String(n).padStart(4, '0')}`;
}

const text = (max: number) => z.string().trim().max(max);
const MAX_LINK = 100;

export const createProblemSchema = z.object({
  title: z.string().trim().min(5, 'Describí el problema en pocas palabras').max(150),
  description: z.string().trim().min(10, 'Agregá un poco más de detalle').max(10_000),
  category: z.enum(TICKET_CATEGORIES, { error: 'Elegí una opción' }),
  /** Tickets que se vinculan al crear el problema (ej. desde la bandeja o un ticket). */
  ticketIds: z.array(uuidSchema).max(MAX_LINK).optional(),
});
export type CreateProblemInput = z.infer<typeof createProblemSchema>;

export const updateProblemSchema = z
  .object({
    title: z.string().trim().min(5).max(150).optional(),
    description: z.string().trim().min(10).max(10_000).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    rootCause: text(5000).nullable().optional(),
    workaround: text(5000).nullable().optional(),
    permanentSolution: text(5000).nullable().optional(),
    ownerId: uuidSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios');
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;

export const changeProblemStatusSchema = z.object({
  status: z.enum(PROBLEM_STATUSES),
  /** Al resolver: resolver también los tickets abiertos vinculados. */
  resolveTickets: z.boolean().default(false),
  /** Mensaje público que reciben los solicitantes de esos tickets. */
  message: text(5000).optional(),
});
export type ChangeProblemStatusInput = z.infer<typeof changeProblemStatusSchema>;

export const linkTicketsSchema = z.object({
  ticketIds: z.array(uuidSchema).min(1, 'Elegí al menos un ticket').max(MAX_LINK),
});
export type LinkTicketsInput = z.infer<typeof linkTicketsSchema>;

export const listProblemsQuerySchema = paginationSchema.extend({
  state: z.enum(['open', 'resolved', 'all']).default('open'),
  q: z.string().trim().max(100).optional(),
});
export type ListProblemsQuery = z.infer<typeof listProblemsQuerySchema>;

// --- Respuestas -------------------------------------------------------------

export type ProblemRef = { id: string; code: string; title: string; status: ProblemStatus };

export type ProblemListItem = ProblemRef & {
  category: TicketCategory;
  owner: UserRef | null;
  ticketCount: number;
  openTicketCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProblemTicket = {
  id: string;
  number: string;
  subject: string;
  status: TicketStatus;
  requester: UserRef;
  createdAt: string;
};

export type ProblemDetail = ProblemListItem & {
  description: string;
  rootCause: string | null;
  workaround: string | null;
  permanentSolution: string | null;
  resolvedAt: string | null;
  createdBy: UserRef;
  tickets: ProblemTicket[];
  /** Mejoras que atacan este problema (solo si quien consulta puede ver mejoras). */
  improvements: ImprovementRef[];
  /** Acciones tomadas (diagnóstico, pruebas, cambios), con adjuntos. */
  actions: WorkLogEntry[];
  activity: TicketActivity[];
};

export type ChangeProblemStatusResponse = { problem: ProblemDetail; resolvedTickets: number };

/** Sugerencias por similitud de texto. La vinculación la decide siempre una persona de IT. */
export type SimilarResults = {
  tickets: (ProblemTicket & { score: number; problem: ProblemRef | null })[];
  problems: (ProblemRef & { score: number; ticketCount: number })[];
};
