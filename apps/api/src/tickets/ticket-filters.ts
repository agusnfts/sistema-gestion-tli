import type { Prisma } from '@tli/db';
import { OPEN_STATUSES } from '@tli/shared';

// Filtros de tickets compartidos por la bandeja y el dashboard: así un número del dashboard y
// la lista a la que lleva cuentan exactamente lo mismo.

/** Las marcas de riesgo/vencimiento las pone el monitor de SLA (ADR 0007). */
export function slaWhere(kind: 'breached' | 'at_risk'): Prisma.TicketWhereInput {
  if (kind === 'breached') {
    return {
      status: { in: [...OPEN_STATUSES] },
      OR: [
        { firstResponseBreachAt: { not: null }, firstRespondedAt: null },
        { resolutionBreachAt: { not: null } },
      ],
    };
  }
  return {
    status: { in: [...OPEN_STATUSES] },
    OR: [
      { firstResponseRiskAt: { not: null }, firstResponseBreachAt: null, firstRespondedAt: null },
      { resolutionRiskAt: { not: null }, resolutionBreachAt: null },
    ],
  };
}

/** Día en Argentina (UTC-3, sin horario de verano) → instante de su comienzo. */
export function startOfLocalDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000-03:00`);
}

/** Fecha de hoy en Argentina (YYYY-MM-DD). */
export function todayLocal(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Rango [desde, hasta] en días locales; "hasta" incluye todo ese día. */
export function dayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    gte: from ? startOfLocalDay(from) : undefined,
    lt: to ? new Date(startOfLocalDay(to).getTime() + 86_400_000) : undefined,
  };
}

/** Cerrado en el período: resuelto, o cerrado sin pasar por resuelto (ej. por una mejora). */
export function doneInRange(range: Prisma.DateTimeFilter): Prisma.TicketWhereInput {
  return { OR: [{ resolvedAt: range }, { resolvedAt: null, closedAt: range }] };
}
