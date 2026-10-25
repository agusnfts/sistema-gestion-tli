import { describe, expect, it } from 'vitest';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLA_POLICIES } from '@tli/shared';
import {
  priorityChangePatch,
  slaSnapshot,
  statusTransitionPatch,
  type SlaTicket,
} from './ticket-sla';

const ctx = {
  calendar: { ...DEFAULT_BUSINESS_HOURS, holidays: [] as string[] },
  policies: DEFAULT_SLA_POLICIES,
};
const ar = (iso: string) => new Date(`${iso}-03:00`);

// Ticket crítico creado el lunes 26/10 a las 9: 1ª respuesta 9:30, resolución 13:00.
const base: SlaTicket = {
  status: 'IN_PROGRESS',
  type: 'SUPPORT',
  priority: 'CRITICAL',
  createdAt: ar('2026-10-26T09:00'),
  firstResponseDueAt: ar('2026-10-26T09:30'),
  resolutionDueAt: ar('2026-10-26T13:00'),
  firstRespondedAt: ar('2026-10-26T09:10'),
  resolvedAt: null,
  slaPausedAt: null,
  slaPausedMinutes: 0,
};

describe('statusTransitionPatch', () => {
  it('pausar en "Esperando usuario" marca el inicio de la pausa', () => {
    const p = statusTransitionPatch(base, 'WAITING_USER', ar('2026-10-26T10:00'), ctx);
    expect(p.slaPausedAt).toEqual(ar('2026-10-26T10:00'));
    expect(p.resolutionDueAt).toBeUndefined();
  });

  it('reanudar corre el vencimiento lo que duró la pausa (en horario hábil)', () => {
    const paused = {
      ...base,
      status: 'WAITING_USER' as const,
      slaPausedAt: ar('2026-10-26T10:00'),
    };
    const p = statusTransitionPatch(paused, 'IN_PROGRESS', ar('2026-10-26T11:30'), ctx);
    expect(p.slaPausedAt).toBeNull();
    expect(p.slaPausedMinutes).toBe(90);
    expect(p.resolutionDueAt).toEqual(ar('2026-10-26T14:30'));
  });

  it('derivar a mejora detiene el reloj y cuenta como primera respuesta', () => {
    const fresh = { ...base, status: 'NEW' as const, firstRespondedAt: null };
    const now = ar('2026-10-26T10:00');
    const p = statusTransitionPatch(fresh, 'DERIVED_TO_IMPROVEMENT', now, ctx);
    expect(p.slaPausedAt).toEqual(now);
    expect(p.firstRespondedAt).toEqual(now);
  });

  it('si vuelve de la mejora, el tiempo derivado no se le cobra', () => {
    const derived = {
      ...base,
      status: 'DERIVED_TO_IMPROVEMENT' as const,
      slaPausedAt: ar('2026-10-26T10:00'),
    };
    const p = statusTransitionPatch(derived, 'IN_PROGRESS', ar('2026-10-26T12:00'), ctx);
    expect(p.slaPausedMinutes).toBe(120);
    expect(p.resolutionDueAt).toEqual(ar('2026-10-26T15:00'));
  });

  it('pasar entre dos estados de espera no corta la pausa', () => {
    const paused = {
      ...base,
      status: 'WAITING_USER' as const,
      slaPausedAt: ar('2026-10-26T10:00'),
    };
    const p = statusTransitionPatch(paused, 'WAITING_VENDOR', ar('2026-10-26T11:00'), ctx);
    expect(p.slaPausedAt).toBeUndefined();
  });

  it('"En curso" cuenta como primera respuesta', () => {
    const p = statusTransitionPatch(
      { ...base, status: 'NEW', firstRespondedAt: null },
      'IN_PROGRESS',
      ar('2026-10-26T09:20'),
      ctx,
    );
    expect(p.firstRespondedAt).toEqual(ar('2026-10-26T09:20'));
  });

  it('resolver registra la fecha y reabrir la limpia', () => {
    const now = ar('2026-10-26T12:00');
    expect(statusTransitionPatch(base, 'RESOLVED', now, ctx).resolvedAt).toEqual(now);
    const reopened = statusTransitionPatch(
      { ...base, status: 'RESOLVED', resolvedAt: now },
      'IN_PROGRESS',
      now,
      ctx,
    );
    expect(reopened.resolvedAt).toBeNull();
  });
});

describe('priorityChangePatch', () => {
  it('recalcula los vencimientos con la nueva prioridad', () => {
    const p = priorityChangePatch(
      { ...base, firstRespondedAt: null },
      'HIGH',
      ar('2026-10-26T09:05'),
      ctx,
    );
    expect(p.firstResponseDueAt).toEqual(ar('2026-10-26T11:00'));
    expect(p.resolutionDueAt).toEqual(ar('2026-10-27T09:00'));
  });
});

describe('slaSnapshot', () => {
  it('informa por vencer, cumplido y pausado', () => {
    const s = slaSnapshot(base, ar('2026-10-26T12:15'), ctx);
    expect(s.firstResponse.state).toBe('MET');
    expect(s.resolution.state).toBe('AT_RISK');
    const paused = slaSnapshot(
      { ...base, slaPausedAt: ar('2026-10-26T10:00') },
      ar('2026-10-26T16:00'),
      ctx,
    );
    expect(paused.resolution.state).toBe('PAUSED');
  });

  it('las propuestas no tienen reloj de resolución', () => {
    const s = slaSnapshot(
      { ...base, type: 'AUTOMATION', resolutionDueAt: null },
      ar('2026-10-26T10:00'),
      ctx,
    );
    expect(s.resolution.state).toBe('STOPPED');
  });
});
