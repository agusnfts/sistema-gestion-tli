import { describe, expect, it } from 'vitest';
import { periodStart, weekKey } from './dashboard.service';

describe('periodStart', () => {
  it('cuenta los días incluyendo hoy', () => {
    expect(periodStart('7d', '2026-10-25')).toBe('2026-10-19');
    expect(periodStart('30d', '2026-10-25')).toBe('2026-09-26');
  });

  it('mes y año empiezan el día 1', () => {
    expect(periodStart('month', '2026-10-25')).toBe('2026-10-01');
    expect(periodStart('year', '2026-10-25')).toBe('2026-01-01');
  });
});

describe('weekKey', () => {
  it('agrupa por semana de lunes a domingo, en hora argentina', () => {
    // Domingo 25/10 a las 23:30 en Argentina (02:30 del lunes en UTC) sigue siendo esa semana.
    expect(weekKey(new Date('2026-10-26T02:30:00Z'))).toBe('2026-10-19');
    expect(weekKey(new Date('2026-10-26T03:30:00Z'))).toBe('2026-10-26');
  });
});
