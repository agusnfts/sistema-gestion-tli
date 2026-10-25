import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import { PRIORITIES, type Priority, type TicketStatus } from '../tickets';
import type { ProblemRef } from './problems';
import type { TicketActivity, UserRef } from './tickets';
import type { WorkLogEntry } from './work-log';

export const IMPROVEMENT_STATUSES = [
  'IDEA',
  'ANALYSIS',
  'APPROVED',
  'IN_DEVELOPMENT',
  'TESTING',
  'IMPLEMENTED',
  'DISCARDED',
] as const;
export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];

export const IMPROVEMENT_STATUS_LABELS: Record<ImprovementStatus, string> = {
  IDEA: 'Idea',
  ANALYSIS: 'En análisis',
  APPROVED: 'Aprobada',
  IN_DEVELOPMENT: 'En desarrollo',
  TESTING: 'En testing',
  IMPLEMENTED: 'Implementada',
  DISCARDED: 'Descartada',
};

/** Estados finales: al llegar se cierran los tickets derivados con el mensaje de cierre. */
export const IMPROVEMENT_FINAL_STATUSES: readonly ImprovementStatus[] = [
  'IMPLEMENTED',
  'DISCARDED',
];

export function isImprovementFinal(status: ImprovementStatus): boolean {
  return IMPROVEMENT_FINAL_STATUSES.includes(status);
}

export const IMPROVEMENT_SYSTEMS = ['WMS', 'TMS', 'TYT', 'ROUTING', 'OTHER'] as const;
export type ImprovementSystem = (typeof IMPROVEMENT_SYSTEMS)[number];

export const IMPROVEMENT_SYSTEM_LABELS: Record<ImprovementSystem, string> = {
  WMS: 'WMS',
  TMS: 'TMS',
  TYT: 'TYT (carga de pedidos)',
  ROUTING: 'Ruteo',
  OTHER: 'Otro',
};

export const CURRENCIES = ['ARS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LEVEL_LABELS: Record<number, string> = { 1: 'Bajo', 2: 'Medio', 3: 'Alto' };

/**
 * Prioridad sugerida por impacto y esfuerzo (1 bajo · 3 alto): mucho impacto con poco
 * esfuerzo es lo primero. "Crítica" solo la pone IT a mano.
 */
export function improvementPriority(impact: number, effort: number): Priority {
  const score = impact * (4 - effort); // 1..9
  if (score >= 6) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}

export function formatImprovementCode(n: number): string {
  return `MEJ-${String(n).padStart(4, '0')}`;
}

const text = (max: number) => z.string().trim().max(max);
const level = z.number().int().min(1).max(3);
const money = z.number().nonnegative().max(1e12);
const hours = z.number().nonnegative().max(100_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const MAX_LINK = 100;

export const createImprovementSchema = z.object({
  title: z.string().trim().min(5, 'Describí la mejora en pocas palabras').max(150),
  system: z.enum(IMPROVEMENT_SYSTEMS, { error: 'Elegí una opción' }),
  requestingAreaId: uuidSchema.nullable().optional(),
  currentSituation: z.string().trim().min(10, 'Contá cómo se trabaja hoy').max(10_000),
  proposal: z.string().trim().min(10, 'Contá qué se propone').max(10_000),
  expectedImpact: text(5000).nullable().optional(),
  impact: level.default(2),
  effort: level.default(2),
  /** Tickets abiertos que se derivan a la mejora al crearla. */
  ticketIds: z.array(uuidSchema).max(MAX_LINK).optional(),
  /** Problemas relacionados. Sus tickets abiertos también se derivan. */
  problemIds: z.array(uuidSchema).max(20).optional(),
});
export type CreateImprovementInput = z.infer<typeof createImprovementSchema>;

export const updateImprovementSchema = z
  .object({
    title: z.string().trim().min(5).max(150).optional(),
    system: z.enum(IMPROVEMENT_SYSTEMS).optional(),
    requestingAreaId: uuidSchema.nullable().optional(),
    currentSituation: z.string().trim().min(10).max(10_000).optional(),
    proposal: z.string().trim().min(10).max(10_000).optional(),
    expectedImpact: text(5000).nullable().optional(),
    impact: level.optional(),
    effort: level.optional(),
    /** null vuelve a la prioridad sugerida por impacto y esfuerzo. */
    priority: z.enum(PRIORITIES).nullable().optional(),
    ownerId: uuidSchema.nullable().optional(),
    providerId: uuidSchema.nullable().optional(),
    currency: z.enum(CURRENCIES).optional(),
    estimatedCost: money.nullable().optional(),
    actualCost: money.nullable().optional(),
    estimatedHours: hours.nullable().optional(),
    actualHours: hours.nullable().optional(),
    startDate: isoDate.nullable().optional(),
    targetDate: isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios');
export type UpdateImprovementInput = z.infer<typeof updateImprovementSchema>;

export const changeImprovementStatusSchema = z
  .object({
    status: z.enum(IMPROVEMENT_STATUSES),
    /** Obligatorio al implementar o descartar: lo reciben los solicitantes de los tickets derivados. */
    closingMessage: text(5000).optional(),
  })
  .refine((v) => !isImprovementFinal(v.status) || (v.closingMessage?.length ?? 0) >= 10, {
    message:
      'Escribí el mensaje de cierre para los solicitantes (qué se hizo o por qué se descarta)',
    path: ['closingMessage'],
  });
export type ChangeImprovementStatusInput = z.infer<typeof changeImprovementStatusSchema>;

export const linkProblemsSchema = z.object({
  problemIds: z.array(uuidSchema).min(1, 'Elegí al menos un problema').max(20),
});
export type LinkProblemsInput = z.infer<typeof linkProblemsSchema>;

export const linkClientsSchema = z.object({
  clientIds: z.array(uuidSchema).min(1, 'Elegí al menos un cliente').max(50),
});
export type LinkClientsInput = z.infer<typeof linkClientsSchema>;

export const listImprovementsQuerySchema = paginationSchema.extend({
  state: z.enum(['active', 'closed', 'all']).default('active'),
  system: z.enum(IMPROVEMENT_SYSTEMS).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListImprovementsQuery = z.infer<typeof listImprovementsQuerySchema>;

// --- Respuestas -------------------------------------------------------------

export type ImprovementRef = {
  id: string;
  code: string;
  title: string;
  status: ImprovementStatus;
};

export type ImprovementListItem = ImprovementRef & {
  system: ImprovementSystem;
  priority: Priority;
  impact: number;
  effort: number;
  owner: UserRef | null;
  provider: { id: string; name: string } | null;
  requestingArea: { id: string; name: string } | null;
  ticketCount: number;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImprovementTicket = {
  id: string;
  number: string;
  subject: string;
  status: TicketStatus;
  requester: UserRef;
  createdAt: string;
};

export type ImprovementDetail = ImprovementListItem & {
  currentSituation: string;
  proposal: string;
  expectedImpact: string | null;
  priorityIsManual: boolean;
  currency: Currency;
  estimatedCost: number | null;
  actualCost: number | null;
  estimatedHours: number | null;
  actualHours: number | null;
  startDate: string | null;
  completedAt: string | null;
  closingMessage: string | null;
  createdBy: UserRef;
  tickets: ImprovementTicket[];
  problems: ProblemRef[];
  clients: { id: string; legalName: string; shortName: string | null }[];
  /** Acciones y avances registrados por IT, con adjuntos. */
  actions: WorkLogEntry[];
  activity: TicketActivity[];
};

export type ChangeImprovementStatusResponse = {
  improvement: ImprovementDetail;
  closedTickets: number;
};
