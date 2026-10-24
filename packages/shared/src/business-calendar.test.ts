import { describe, expect, it } from 'vitest';
import {
  addBusinessMinutes,
  businessMinutesBetween,
  DEFAULT_BUSINESS_HOURS,
  localDateKey,
  tzOffsetMinutes,
  type BusinessCalendar,
} from './business-calendar';
import {
  computeDueDates,
  DEFAULT_SLA_POLICIES,
  evaluateSla,
  formatTicketNumber,
  parseTicketNumber,
} from './tickets';

// Argentina: UTC-3 sin horario de verano. 2026-10-26 es lunes.
const cal: BusinessCalendar = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-10-12', '2026-11-23'] };
const ar = (iso: string) => new Date(`${iso}-03:00`);

describe('tzOffsetMinutes', () => {
  it('Buenos Aires es UTC-3', () => {
    expect(tzOffsetMinutes(new Date('2026-01-15T12:00:00Z'), cal.timezone)).toBe(-180);
    expect(tzOffsetMinutes(new Date('2026-07-15T12:00:00Z'), cal.timezone)).toBe(-180);
  });

  it('calcula la fecha local', () => {
    expect(localDateKey(new Date('2026-10-27T01:30:00Z'), cal.timezone)).toBe('2026-10-26');
  });
});

describe('addBusinessMinutes', () => {
  it('suma dentro del mismo día', () => {
    expect(addBusinessMinutes(ar('2026-10-26T09:00'), 30, cal)).toEqual(ar('2026-10-26T09:30'));
  });

  it('pasa al día siguiente al terminar la jornada', () => {
    // Martes 16:50 + 30 min = 10 min hoy + 20 min mañana desde las 8.
    expect(addBusinessMinutes(ar('2026-10-27T16:50'), 30, cal)).toEqual(ar('2026-10-28T08:20'));
  });

  it('salta el fin de semana', () => {
    // Viernes 16:00 + 2 h = 1 h viernes + 1 h lunes.
    expect(addBusinessMinutes(ar('2026-10-30T16:00'), 120, cal)).toEqual(ar('2026-11-02T09:00'));
  });

  it('salta feriados', () => {
    // Viernes 20/11 16:00 + 2 h: el lunes 23/11 es feriado → martes 24 a las 9.
    expect(addBusinessMinutes(ar('2026-11-20T16:00'), 120, cal)).toEqual(ar('2026-11-24T09:00'));
  });

  it('un ticket creado fuera de horario empieza a contar al día hábil siguiente', () => {
    expect(addBusinessMinutes(ar('2026-10-26T22:00'), 30, cal)).toEqual(ar('2026-10-27T08:30'));
    expect(addBusinessMinutes(ar('2026-10-31T10:00'), 30, cal)).toEqual(ar('2026-11-02T08:30'));
  });

  it('1 día hábil (540 min) desde las 8 termina a las 17 del mismo día', () => {
    expect(addBusinessMinutes(ar('2026-10-26T08:00'), 540, cal)).toEqual(ar('2026-10-26T17:00'));
  });

  it('5 días hábiles desde un lunes a las 10 terminan el lunes siguiente a las 10', () => {
    expect(addBusinessMinutes(ar('2026-10-26T10:00'), 5 * 540, cal)).toEqual(
      ar('2026-11-02T10:00'),
    );
  });

  it('falla si no hay días hábiles', () => {
    expect(() => addBusinessMinutes(new Date(), 10, { ...cal, days: {} })).toThrow();
  });
});

describe('businessMinutesBetween', () => {
  it('cuenta solo horario hábil', () => {
    expect(businessMinutesBetween(ar('2026-10-30T16:00'), ar('2026-11-02T09:00'), cal)).toBe(120);
  });

  it('es la inversa de addBusinessMinutes', () => {
    const start = ar('2026-10-27T11:17');
    for (const m of [1, 45, 540, 1234, 4000]) {
      expect(businessMinutesBetween(start, addBusinessMinutes(start, m, cal), cal)).toBe(m);
    }
  });

  it('devuelve 0 si el fin es anterior', () => {
    expect(businessMinutesBetween(ar('2026-10-27T11:00'), ar('2026-10-27T10:00'), cal)).toBe(0);
  });
});

describe('SLA', () => {
  it('calcula vencimientos de soporte y de propuestas', () => {
    const createdAt = ar('2026-10-26T09:00');
    const crit = computeDueDates({
      createdAt,
      type: 'SUPPORT',
      priority: 'CRITICAL',
      pausedMinutes: 0,
      policies: DEFAULT_SLA_POLICIES,
      calendar: cal,
    });
    expect(crit.firstResponseDueAt).toEqual(ar('2026-10-26T09:30'));
    expect(crit.resolutionDueAt).toEqual(ar('2026-10-26T13:00'));

    const proposal = computeDueDates({
      createdAt,
      type: 'AUTOMATION',
      priority: 'CRITICAL',
      pausedMinutes: 0,
      policies: DEFAULT_SLA_POLICIES,
      calendar: cal,
    });
    expect(proposal.firstResponseDueAt).toEqual(ar('2026-10-28T09:00'));
    expect(proposal.resolutionDueAt).toBeNull();
  });

  it('las pausas corren el vencimiento', () => {
    const due = computeDueDates({
      createdAt: ar('2026-10-26T09:00'),
      type: 'SUPPORT',
      priority: 'CRITICAL',
      pausedMinutes: 60,
      policies: DEFAULT_SLA_POLICIES,
      calendar: cal,
    });
    expect(due.resolutionDueAt).toEqual(ar('2026-10-26T14:00'));
  });

  const base = {
    dueAt: ar('2026-10-26T13:00'),
    targetMinutes: 240,
    doneAt: null,
    pausedAt: null,
    stopped: false,
    calendar: cal,
  };

  it('pasa a "por vencer" con el 25 % restante y a "vencido" al superarlo', () => {
    expect(evaluateSla({ ...base, now: ar('2026-10-26T10:00') }).state).toBe('ON_TRACK');
    expect(evaluateSla({ ...base, now: ar('2026-10-26T12:00') }).state).toBe('AT_RISK');
    expect(evaluateSla({ ...base, now: ar('2026-10-26T13:01') }).state).toBe('BREACHED');
  });

  it('cumplido o vencido según cuándo se completó', () => {
    expect(
      evaluateSla({ ...base, doneAt: ar('2026-10-26T12:59'), now: ar('2026-10-27T10:00') }).state,
    ).toBe('MET');
    expect(
      evaluateSla({ ...base, doneAt: ar('2026-10-26T13:30'), now: ar('2026-10-27T10:00') }).state,
    ).toBe('BREACHED');
  });

  it('pausado congela el tiempo restante aunque pase la hora de vencimiento', () => {
    const r = evaluateSla({
      ...base,
      pausedAt: ar('2026-10-26T10:00'),
      now: ar('2026-10-26T16:00'),
    });
    expect(r).toEqual({ state: 'PAUSED', remainingMinutes: 180 });
  });
});

describe('número de ticket', () => {
  it('formatea y parsea', () => {
    expect(formatTicketNumber(123)).toBe('TLI-000123');
    expect(parseTicketNumber('TLI-000123')).toBe(123);
    expect(parseTicketNumber('tli-45')).toBe(45);
    expect(parseTicketNumber('78')).toBe(78);
    expect(parseTicketNumber('ABC')).toBeNull();
  });
});

describe('categorías por tipo de ticket', () => {
  it('cada tipo ofrece sus propias categorías', async () => {
    const { CATEGORIES_BY_TYPE, fixedCategoryFor, isCategoryAllowed } = await import('./tickets');
    expect(CATEGORIES_BY_TYPE.AUTOMATION).not.toContain('ACCESS');
    expect(CATEGORIES_BY_TYPE.ACCESS).not.toContain('HARDWARE');
    expect(isCategoryAllowed('SUPPORT', 'NETWORK')).toBe(true);
    expect(isCategoryAllowed('AUTOMATION', 'HARDWARE')).toBe(false);
    expect(fixedCategoryFor('INTEGRATION')).toBe('INTEGRATION');
    expect(fixedCategoryFor('SUPPORT')).toBeNull();
  });
});
