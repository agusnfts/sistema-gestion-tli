import {
  ANNOUNCEMENT_IMPACT_LABELS,
  BUSINESS_SYSTEM_LABELS,
  type AnnouncementImpact,
  type AnnouncementSendKind,
  type BusinessSystem,
} from './schemas/announcements';

export type AnnouncementForEmail = {
  title: string;
  systems: BusinessSystem[];
  reason: string;
  details: string | null;
  impact: AnnouncementImpact;
  startsAt: Date;
  endsAt: Date | null;
  closingNote: string | null;
};

const TZ = 'America/Argentina/Buenos_Aires';
// Se arma a mano con formatToParts: el formato corto de Intl cambia entre versiones de ICU.
const partsFormat = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TZ,
});
const parts = (d: Date) =>
  Object.fromEntries(partsFormat.formatToParts(d).map((p) => [p.type, p.value])) as Record<
    Intl.DateTimeFormatPartTypes,
    string
  >;
const day = (d: Date, withYear = true) => {
  const p = parts(d);
  return `${p.weekday} ${p.day}/${p.month}${withYear ? `/${p.year}` : ''}`;
};
const time = (d: Date) => {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
};

const sameDay = (a: Date, b: Date) => day(a) === day(b);

/** "lunes 27/10/2026 de 22:00 a 23:30 h" (siempre en hora de Argentina). */
export function formatWindow(startsAt: Date, endsAt: Date | null): string {
  const start = `${day(startsAt)} a las ${time(startsAt)} h`;
  if (!endsAt) return start;
  if (sameDay(startsAt, endsAt)) return `${day(startsAt)} de ${time(startsAt)} a ${time(endsAt)} h`;
  return `desde el ${start} hasta el ${day(endsAt)} a las ${time(endsAt)} h`;
}

function systemList(systems: BusinessSystem[]): string {
  const names = systems.map((s) => BUSINESS_SYSTEM_LABELS[s].replace(/ \(.*\)$/, ''));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]!;
}

const INTRO: Record<AnnouncementSendKind, string> = {
  NOTICE: 'Te avisamos que está programada una actualización de sistemas.',
  REMINDER: 'Te recordamos que se acerca una actualización de sistemas.',
  DONE: 'La actualización de sistemas terminó. Ya se puede trabajar con normalidad.',
  CANCELLED: 'La actualización de sistemas que te avisamos se canceló. No hay cambios.',
};

/**
 * Mail en texto plano para la operación. No lleva datos personales ni detalle interno.
 * Lo usan la API (envío) y la web (vista previa).
 */
export function buildAnnouncementEmail(
  a: AnnouncementForEmail,
  kind: AnnouncementSendKind,
  appOrigin: string,
): { subject: string; text: string } {
  const systems = systemList(a.systems);
  const when = `${day(a.startsAt, false)}, ${time(a.startsAt)} h`;
  const subject = {
    NOTICE: `Actualización de ${systems}: ${when}`,
    REMINDER: `Recordatorio: actualización de ${systems}, ${when}`,
    DONE: `Finalizó la actualización de ${systems}`,
    CANCELLED: `Cancelada: actualización de ${systems} del ${when}`,
  }[kind];

  const lines = [
    INTRO[kind],
    '',
    `Qué se actualiza: ${a.title}`,
    `Sistemas: ${systems}`,
    `Cuándo: ${formatWindow(a.startsAt, a.endsAt)} (hora de Argentina)`,
  ];
  if (kind === 'NOTICE' || kind === 'REMINDER') {
    lines.push(`Impacto: ${ANNOUNCEMENT_IMPACT_LABELS[a.impact]}`, `Motivo: ${a.reason}`);
    if (a.details) lines.push('', a.details);
  }
  if ((kind === 'DONE' || kind === 'CANCELLED') && a.closingNote) {
    lines.push('', a.closingNote);
  }
  lines.push(
    '',
    'Ante cualquier inconveniente, avisá al área TLI. Si tenés usuario del sistema, podés cargar ' +
      `un ticket en ${appOrigin}/tickets/nuevo`,
    '',
    'Área de Tecnología Logística e Innovación (TLI) · TML Logística',
  );
  return { subject: `[TLI] ${subject}`, text: lines.join('\n') };
}
