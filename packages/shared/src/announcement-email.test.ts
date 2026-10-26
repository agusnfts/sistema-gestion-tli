import { describe, expect, it } from 'vitest';
import { buildAnnouncementEmail, formatWindow } from './announcement-email';

// 27/10/2026 22:00 en Argentina (UTC-3).
const start = new Date('2026-10-28T01:00:00.000Z');
const base = {
  title: 'Nueva versión del WMS',
  systems: ['WMS', 'TYT'] as ('WMS' | 'TYT')[],
  reason: 'Mejoras de picking',
  details: null,
  impact: 'OUTAGE' as const,
  startsAt: start,
  endsAt: new Date('2026-10-28T02:30:00.000Z'),
  closingNote: null,
};

describe('mail de aviso de actualización', () => {
  it('muestra la ventana en hora de Argentina', () => {
    expect(formatWindow(base.startsAt, base.endsAt)).toBe('martes 27/10/2026 de 22:00 a 23:30 h');
    expect(formatWindow(base.startsAt, null)).toBe('martes 27/10/2026 a las 22:00 h');
    expect(formatWindow(base.startsAt, new Date('2026-10-28T12:00:00.000Z'))).toBe(
      'desde el martes 27/10/2026 a las 22:00 h hasta el miércoles 28/10/2026 a las 09:00 h',
    );
  });

  it('arma asunto y cuerpo según el tipo de envío', () => {
    const notice = buildAnnouncementEmail(base, 'NOTICE', 'https://tli.example');
    expect(notice.subject).toBe('[TLI] Actualización de WMS y TYT: martes 27/10, 22:00 h');
    expect(notice.text).toContain('Motivo: Mejoras de picking');
    expect(notice.text).toContain('https://tli.example/tickets/nuevo');

    const done = buildAnnouncementEmail(
      { ...base, closingNote: 'Quedó la 8.2' },
      'DONE',
      'https://tli.example',
    );
    expect(done.subject).toBe('[TLI] Finalizó la actualización de WMS y TYT');
    expect(done.text).toContain('Quedó la 8.2');
    expect(done.text).not.toContain('Motivo:');
  });
});
