import { z } from 'zod';
import { uuidSchema } from './common';
import type { Priority, TicketCategory, TicketType } from '../tickets';
import type { ProblemStatus } from './problems';
import type { ImprovementStatus, ImprovementSystem, Currency } from './improvements';
import type { IntegrationStatus } from './integrations';
import type { ClientStatus } from './clients';
import type { UserRef } from './tickets';

// Dashboard (Fase 7): indicadores agregados con filtros de período y responsable. Cada número
// tiene una lista filtrada detrás (drill-down) que cuenta exactamente lo mismo.

export const DASHBOARD_PERIODS = ['7d', '30d', '90d', 'month', 'year'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  month: 'Este mes',
  year: 'Este año',
};

export const dashboardQuerySchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default('30d'),
  /** Responsable: filtra tickets por asignado y problemas, mejoras e integraciones por dueño. */
  owner: z.union([z.literal('me'), uuidSchema]).optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export type Count<K extends string> = { key: K; count: number };

export type DashboardData = {
  /** Período efectivo en días locales (para armar los links a las listas). */
  range: { from: string; to: string };
  tickets: {
    open: number;
    unassigned: number;
    breached: number;
    atRisk: number;
    created: number;
    done: number;
    /** Promedio de primera respuesta en minutos hábiles (tickets creados en el período). */
    firstResponseAvgMinutes: number | null;
    /** % de tickets con primera respuesta a tiempo / resueltos dentro del SLA, en el período. */
    firstResponseOnTimePct: number | null;
    resolutionOnTimePct: number | null;
    weekly: { week: string; created: number; done: number }[];
    openByCategory: Count<TicketCategory>[];
    openByPriority: Count<Priority>[];
    openByAssignee: { assignee: UserRef | null; count: number }[];
    createdByType: Count<TicketType>[];
  };
  proposals: {
    received: number;
    /** De las recibidas en el período, cuántas ya se derivaron a una mejora o integración. */
    converted: number;
    pendingFirstResponse: number;
  };
  problems: {
    active: number;
    byStatus: Count<ProblemStatus>[];
    openTicketsLinked: number;
    resolvedInPeriod: number;
  };
  improvements: {
    active: number;
    byStatus: Count<ImprovementStatus>[];
    activeBySystem: Count<ImprovementSystem>[];
    implementedInPeriod: number;
    discardedInPeriod: number;
  };
  integrations: {
    pending: number;
    overdue: number;
    byStatus: Count<IntegrationStatus>[];
    completedInPeriod: number;
    notDoneInPeriod: number;
    /** Finalizadas en el período: costo estimado (cotización elegida) vs real, por moneda. */
    costs: { currency: Currency; estimated: number; actual: number; count: number }[];
  };
  clients: {
    byStatus: Count<ClientStatus>[];
    withPendingIntegrations: number;
  };
};
