/**
 * Calendario hábil para el cálculo de SLA (ADR 0007). Lógica pura, sin I/O.
 *
 * Trabaja en "hora de pared" de la zona configurada: un instante UTC se pasa a
 * milisegundos de pared (UTC + offset de la zona en ese instante), se opera
 * sobre los días/horarios locales y se vuelve a UTC.
 */

export type BusinessHours = {
  /** Zona IANA, ej. America/Argentina/Buenos_Aires. */
  timezone: string;
  /** Horario por día de la semana (0 = domingo … 6 = sábado). Días ausentes = no hábiles. */
  days: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { start: string; end: string }>>;
};

export type BusinessCalendar = BusinessHours & {
  /** Feriados en formato YYYY-MM-DD (fecha local). */
  holidays: ReadonlySet<string> | readonly string[];
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/Argentina/Buenos_Aires',
  days: {
    1: { start: '08:00', end: '17:00' },
    2: { start: '08:00', end: '17:00' },
    3: { start: '08:00', end: '17:00' },
    4: { start: '08:00', end: '17:00' },
    5: { start: '08:00', end: '17:00' },
  },
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const offsetCache = new Map<string, Intl.DateTimeFormat>();

/** Offset de la zona respecto de UTC (en minutos) en un instante dado. */
export function tzOffsetMinutes(instant: Date, timezone: string): number {
  let fmt = offsetCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetCache.set(timezone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE);
}

function toWall(instant: Date, tz: string): number {
  return instant.getTime() + tzOffsetMinutes(instant, tz) * MINUTE;
}

function fromWall(wallMs: number, tz: string): Date {
  // El offset se toma en el instante aproximado; se corrige una vez por si cruza un cambio de horario.
  const guess = new Date(wallMs - tzOffsetMinutes(new Date(wallMs), tz) * MINUTE);
  return new Date(wallMs - tzOffsetMinutes(guess, tz) * MINUTE);
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return ((h ?? 0) * 60 + (m ?? 0)) * MINUTE;
}

function dayKey(wallDayStart: number): string {
  return new Date(wallDayStart).toISOString().slice(0, 10);
}

/** Ventana hábil [inicio, fin) del día local que empieza en `wallDayStart`, o null si no es hábil. */
function windowFor(wallDayStart: number, cal: BusinessCalendar): [number, number] | null {
  const weekday = new Date(wallDayStart).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const hours = cal.days[weekday];
  if (!hours) return null;
  const holidays = cal.holidays instanceof Set ? cal.holidays : new Set(cal.holidays);
  if (holidays.has(dayKey(wallDayStart))) return null;
  const start = wallDayStart + parseHm(hours.start);
  const end = wallDayStart + parseHm(hours.end);
  return end > start ? [start, end] : null;
}

// Tope de seguridad: si la configuración no tiene días hábiles no se itera para siempre.
const MAX_DAYS = 3660;

/** Instante en que se cumplen `minutes` minutos hábiles a partir de `start`. */
export function addBusinessMinutes(start: Date, minutes: number, cal: BusinessCalendar): Date {
  let remaining = Math.max(0, minutes) * MINUTE;
  let wall = toWall(start, cal.timezone);
  let dayStart = wall - (((wall % DAY) + DAY) % DAY);
  for (let i = 0; i < MAX_DAYS; i++, dayStart += DAY) {
    const win = windowFor(dayStart, cal);
    if (!win) continue;
    const from = Math.max(win[0], wall);
    if (from >= win[1]) continue;
    const available = win[1] - from;
    if (remaining <= available) {
      // Con 0 minutos restantes se devuelve el próximo instante hábil.
      return fromWall(from + remaining, cal.timezone);
    }
    remaining -= available;
    wall = win[1];
  }
  throw new Error('El calendario hábil no tiene días hábiles configurados');
}

/** Minutos hábiles entre dos instantes (0 si b <= a). */
export function businessMinutesBetween(a: Date, b: Date, cal: BusinessCalendar): number {
  if (b <= a) return 0;
  const wallA = toWall(a, cal.timezone);
  const wallB = toWall(b, cal.timezone);
  let total = 0;
  let dayStart = wallA - (((wallA % DAY) + DAY) % DAY);
  for (let i = 0; i < MAX_DAYS && dayStart < wallB; i++, dayStart += DAY) {
    const win = windowFor(dayStart, cal);
    if (!win) continue;
    const from = Math.max(win[0], wallA);
    const to = Math.min(win[1], wallB);
    if (to > from) total += to - from;
  }
  return Math.floor(total / MINUTE);
}

/** Minutos hábiles que tiene un día hábil típico (para expresar "1 día hábil" en la UI). */
export function minutesPerBusinessDay(hours: BusinessHours): number {
  const first = Object.values(hours.days).find(Boolean);
  return first ? (parseHm(first.end) - parseHm(first.start)) / MINUTE : 0;
}

/** Fecha local YYYY-MM-DD de un instante en la zona dada. */
export function localDateKey(instant: Date, timezone: string): string {
  return new Date(toWall(instant, timezone)).toISOString().slice(0, 10);
}
