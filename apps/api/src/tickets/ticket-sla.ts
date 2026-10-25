import {
  businessMinutesBetween,
  computeDueDates,
  evaluateSla,
  PAUSED_STATUSES,
  DERIVED_STATUSES,
  SLA_STOPPED_STATUSES,
  slaTargets,
  type BusinessCalendar,
  type Priority,
  type SlaInfo,
  type SlaPolicies,
  type TicketStatus,
  type TicketType,
} from '@tli/shared';

export type SlaContext = { calendar: BusinessCalendar; policies: SlaPolicies };

/** Campos del ticket que intervienen en el SLA. */
export type SlaTicket = {
  status: TicketStatus;
  type: TicketType;
  priority: Priority;
  createdAt: Date;
  firstResponseDueAt: Date;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedMinutes: number;
};

export type SlaPatch = Partial<{
  status: TicketStatus;
  priority: Priority;
  firstResponseDueAt: Date;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedMinutes: number;
  firstResponseRiskAt: Date | null;
  firstResponseBreachAt: Date | null;
  resolutionRiskAt: Date | null;
  resolutionBreachAt: Date | null;
}>;

function dueDates(t: SlaTicket, priority: Priority, pausedMinutes: number, ctx: SlaContext) {
  return computeDueDates({
    createdAt: t.createdAt,
    type: t.type,
    priority,
    pausedMinutes,
    policies: ctx.policies,
    calendar: ctx.calendar,
  });
}

/**
 * Cambios de SLA y fechas que implica pasar a `to`:
 * pausa/reanudación (corriendo los vencimientos), primera respuesta, resolución y cierre.
 */
export function statusTransitionPatch(
  t: SlaTicket,
  to: TicketStatus,
  now: Date,
  ctx: SlaContext,
): SlaPatch {
  const patch: SlaPatch = { status: to };
  const wasPaused = t.slaPausedAt !== null;
  // Derivado a mejora/integración cuenta como pausa: si el ticket vuelve, el tiempo no se le cobra.
  const willPause = PAUSED_STATUSES.includes(to) || DERIVED_STATUSES.includes(to);

  if (wasPaused && !willPause) {
    const pausedMinutes =
      t.slaPausedMinutes + businessMinutesBetween(t.slaPausedAt!, now, ctx.calendar);
    Object.assign(patch, dueDates(t, t.priority, pausedMinutes, ctx), {
      slaPausedAt: null,
      slaPausedMinutes: pausedMinutes,
      // El vencimiento se corrió: la alerta de "por vencer" se puede volver a disparar.
      firstResponseRiskAt: null,
      resolutionRiskAt: null,
    });
  } else if (!wasPaused && willPause) {
    patch.slaPausedAt = now;
  }

  if ((to === 'IN_PROGRESS' || DERIVED_STATUSES.includes(to)) && !t.firstRespondedAt)
    patch.firstRespondedAt = now;
  if (to === 'RESOLVED') {
    patch.resolvedAt = now;
    if (!t.firstRespondedAt) patch.firstRespondedAt = now;
  }
  if (t.status === 'RESOLVED' && to !== 'CLOSED') patch.resolvedAt = null;
  if (to === 'CLOSED') patch.closedAt = now;
  return patch;
}

/** Cambio de prioridad: nuevos vencimientos y se reinician las alertas de relojes pendientes. */
export function priorityChangePatch(
  t: SlaTicket,
  priority: Priority,
  now: Date,
  ctx: SlaContext,
): SlaPatch {
  const pausedMinutes =
    t.slaPausedMinutes +
    (t.slaPausedAt ? businessMinutesBetween(t.slaPausedAt, now, ctx.calendar) : 0);
  const due = dueDates(t, priority, pausedMinutes, ctx);
  const patch: SlaPatch = { priority, resolutionDueAt: due.resolutionDueAt };
  if (!t.firstRespondedAt) {
    Object.assign(patch, {
      firstResponseDueAt: due.firstResponseDueAt,
      firstResponseRiskAt: null,
      firstResponseBreachAt: null,
    });
  }
  if (!t.resolvedAt) Object.assign(patch, { resolutionRiskAt: null, resolutionBreachAt: null });
  return patch;
}

/** Estado actual de los dos relojes, para mostrar. */
export function slaSnapshot(
  t: SlaTicket,
  now: Date,
  ctx: SlaContext,
): { firstResponse: SlaInfo; resolution: SlaInfo } {
  const targets = slaTargets(t.type, t.priority, ctx.policies);
  const stopped = SLA_STOPPED_STATUSES.includes(t.status);
  const fr = evaluateSla({
    dueAt: t.firstResponseDueAt,
    targetMinutes: targets.firstResponseMinutes,
    doneAt: t.firstRespondedAt,
    pausedAt: t.slaPausedAt,
    stopped,
    now,
    calendar: ctx.calendar,
  });
  const res = evaluateSla({
    dueAt: t.resolutionDueAt,
    targetMinutes: targets.resolutionMinutes,
    doneAt: t.resolvedAt,
    pausedAt: t.slaPausedAt,
    stopped: stopped && t.status !== 'RESOLVED',
    now,
    calendar: ctx.calendar,
  });
  return {
    firstResponse: { ...fr, dueAt: t.firstResponseDueAt.toISOString() },
    resolution: { ...res, dueAt: t.resolutionDueAt?.toISOString() ?? null },
  };
}
