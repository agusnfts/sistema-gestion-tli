import {
  addBusinessMinutes,
  businessMinutesBetween,
  type BusinessCalendar,
} from './business-calendar';

export const TICKET_TYPES = ['SUPPORT', 'AUTOMATION', 'INTEGRATION', 'ACCESS'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_TYPE_LABELS: Record<
  TicketType,
  { title: string; short: string; help: string }
> = {
  SUPPORT: {
    title: 'Soporte',
    short: 'Soporte',
    help: 'Algo no anda, da error o necesitás ayuda con un sistema o un equipo',
  },
  AUTOMATION: {
    title: 'Automatización',
    short: 'Automatización',
    help: 'Proponer una mejora o automatizar algo que hoy se hace a mano',
  },
  INTEGRATION: {
    title: 'Integración',
    short: 'Integración',
    help: 'Intercambiar archivos o datos con un cliente, un expreso u otro',
  },
  ACCESS: {
    title: 'Acceso',
    short: 'Acceso',
    help: 'Alta, baja o cambio de permisos de un usuario en un sistema',
  },
};

/** Automatizaciones e integraciones solo tienen SLA de primera respuesta. */
export function isProposalType(type: TicketType): boolean {
  return type === 'AUTOMATION' || type === 'INTEGRATION';
}

export const TICKET_CATEGORIES = [
  'WMS',
  'TMS',
  'TYT',
  'ROUTING',
  'INTEGRATION',
  'ACCESS',
  'HARDWARE',
  'NETWORK',
  'OTHER',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  WMS: 'WMS',
  TMS: 'TMS',
  TYT: 'TYT (carga de pedidos de clientes)',
  ROUTING: 'Routing (ruteador)',
  INTEGRATION: 'Integración',
  // Solo para tickets anteriores: los accesos ahora son un tipo de ticket.
  ACCESS: 'Accesos y permisos',
  HARDWARE: 'Hardware (PC, impresoras, lectores)',
  NETWORK: 'Red e internet',
  OTHER: 'Otro',
};

/**
 * Categorías que tienen sentido para cada tipo de ticket, en el orden en que se ofrecen.
 * La primera es la sugerida por defecto.
 */
export const CATEGORIES_BY_TYPE: Record<TicketType, readonly TicketCategory[]> = {
  SUPPORT: ['WMS', 'TMS', 'TYT', 'ROUTING', 'INTEGRATION', 'HARDWARE', 'NETWORK', 'OTHER'],
  AUTOMATION: ['WMS', 'TMS', 'TYT', 'ROUTING', 'OTHER'],
  INTEGRATION: ['INTEGRATION'],
  ACCESS: ['WMS', 'TMS', 'TYT', 'ROUTING', 'OTHER'],
};

/** Cómo se pregunta la categoría en el formulario de cada tipo. */
export const CATEGORY_QUESTION: Record<TicketType, string> = {
  SUPPORT: '¿Con qué sistema o equipo?',
  AUTOMATION: '¿Sobre qué sistema?',
  INTEGRATION: 'Categoría',
  ACCESS: '¿A qué sistema?',
};

export function isCategoryAllowed(type: TicketType, category: TicketCategory): boolean {
  return CATEGORIES_BY_TYPE[type].includes(category);
}

/**
 * Categoría fija según el tipo (si el tipo admite una sola): el formulario de un pedido de
 * integración tiene sus propias preguntas, así que su categoría no se puede cambiar.
 */
export function fixedCategoryFor(type: TicketType): TicketCategory | null {
  const allowed = CATEGORIES_BY_TYPE[type];
  return allowed.length === 1 ? allowed[0]! : null;
}

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

/** Ayuda para que el usuario elija la urgencia percibida. */
export const URGENCY_HELP: Record<Priority, string> = {
  CRITICAL: 'No se puede recibir o despachar; el WMS/TMS está caído',
  HIGH: 'Un proceso está bloqueado para un cliente o un sector',
  MEDIUM: 'Hay un error pero se puede seguir trabajando',
  LOW: 'Consulta, ajuste menor o pedido sin apuro',
};

export const TICKET_STATUSES = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_USER',
  'WAITING_VENDOR',
  'RESOLVED',
  'CLOSED',
  'DERIVED_TO_IMPROVEMENT',
  'DERIVED_TO_INTEGRATION',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'Nuevo',
  ASSIGNED: 'Asignado',
  IN_PROGRESS: 'En curso',
  WAITING_USER: 'Esperando usuario',
  WAITING_VENDOR: 'Esperando proveedor',
  RESOLVED: 'Resuelto',
  CLOSED: 'Cerrado',
  DERIVED_TO_IMPROVEMENT: 'Derivado a mejora',
  DERIVED_TO_INTEGRATION: 'Derivado a integración',
};

export const OPEN_STATUSES: readonly TicketStatus[] = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_USER',
  'WAITING_VENDOR',
];
/** En estos estados el reloj de SLA está pausado. */
export const PAUSED_STATUSES: readonly TicketStatus[] = ['WAITING_USER', 'WAITING_VENDOR'];
/** En estos estados el SLA ya no corre (resuelto, cerrado o derivado). */
export const SLA_STOPPED_STATUSES: readonly TicketStatus[] = [
  'RESOLVED',
  'CLOSED',
  'DERIVED_TO_IMPROVEMENT',
  'DERIVED_TO_INTEGRATION',
];

/**
 * Transiciones manuales que puede hacer IT. Las derivaciones a mejora/integración
 * las hacen sus propios módulos (Fases 4 y 5).
 */
export const MANUAL_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['IN_PROGRESS', 'WAITING_USER', 'WAITING_VENDOR', 'RESOLVED'],
  ASSIGNED: ['IN_PROGRESS', 'WAITING_USER', 'WAITING_VENDOR', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_USER', 'WAITING_VENDOR', 'RESOLVED'],
  WAITING_USER: ['IN_PROGRESS', 'WAITING_VENDOR', 'RESOLVED'],
  WAITING_VENDOR: ['IN_PROGRESS', 'WAITING_USER', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
  DERIVED_TO_IMPROVEMENT: [],
  DERIVED_TO_INTEGRATION: [],
};

export function formatTicketNumber(n: number): string {
  return `TLI-${String(n).padStart(6, '0')}`;
}

/** Acepta "TLI-000123", "tli-123" o "123". */
export function parseTicketNumber(value: string): number | null {
  const m = /^(?:tli-?)?0*(\d{1,9})$/i.exec(value.trim());
  return m ? Number(m[1]) : null;
}

// --- SLA -------------------------------------------------------------------

export type SlaPolicies = {
  support: Record<Priority, { firstResponseMinutes: number; resolutionMinutes: number }>;
  proposalFirstResponseMinutes: number;
};

/** Valores iniciales del brief (minutos hábiles; 1 día hábil = 9 h de 8 a 17). */
export const DEFAULT_SLA_POLICIES: SlaPolicies = {
  support: {
    CRITICAL: { firstResponseMinutes: 30, resolutionMinutes: 4 * 60 },
    HIGH: { firstResponseMinutes: 2 * 60, resolutionMinutes: 9 * 60 },
    MEDIUM: { firstResponseMinutes: 4 * 60, resolutionMinutes: 3 * 9 * 60 },
    LOW: { firstResponseMinutes: 9 * 60, resolutionMinutes: 5 * 9 * 60 },
  },
  proposalFirstResponseMinutes: 2 * 9 * 60,
};

export function slaTargets(
  type: TicketType,
  priority: Priority,
  policies: SlaPolicies,
): { firstResponseMinutes: number; resolutionMinutes: number | null } {
  if (isProposalType(type)) {
    return { firstResponseMinutes: policies.proposalFirstResponseMinutes, resolutionMinutes: null };
  }
  return policies.support[priority];
}

/**
 * Vencimientos a partir de la creación. Las pausas se compensan sumando los minutos
 * hábiles pausados al objetivo.
 */
export function computeDueDates(input: {
  createdAt: Date;
  type: TicketType;
  priority: Priority;
  pausedMinutes: number;
  policies: SlaPolicies;
  calendar: BusinessCalendar;
}): { firstResponseDueAt: Date; resolutionDueAt: Date | null } {
  const t = slaTargets(input.type, input.priority, input.policies);
  return {
    firstResponseDueAt: addBusinessMinutes(
      input.createdAt,
      t.firstResponseMinutes + input.pausedMinutes,
      input.calendar,
    ),
    resolutionDueAt:
      t.resolutionMinutes === null
        ? null
        : addBusinessMinutes(
            input.createdAt,
            t.resolutionMinutes + input.pausedMinutes,
            input.calendar,
          ),
  };
}

export const SLA_STATES = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED', 'STOPPED'] as const;
export type SlaState = (typeof SLA_STATES)[number];

export const SLA_STATE_LABELS: Record<SlaState, string> = {
  ON_TRACK: 'En término',
  AT_RISK: 'Por vencer',
  BREACHED: 'Vencido',
  MET: 'Cumplido',
  PAUSED: 'Pausado',
  STOPPED: 'Detenido',
};

/** Fracción restante del objetivo a partir de la cual se alerta (25 %). */
export const SLA_AT_RISK_FRACTION = 0.25;

/**
 * Estado de un reloj de SLA.
 * - doneAt: cuándo se cumplió (primera respuesta o resolución), si ocurrió.
 */
export function evaluateSla(input: {
  dueAt: Date | null;
  targetMinutes: number | null;
  doneAt: Date | null;
  /** Si el reloj está pausado, desde cuándo (el vencimiento se corre recién al reanudar). */
  pausedAt: Date | null;
  stopped: boolean;
  now: Date;
  calendar: BusinessCalendar;
}): { state: SlaState; remainingMinutes: number | null } {
  if (!input.dueAt || input.targetMinutes === null)
    return { state: 'STOPPED', remainingMinutes: null };
  if (input.doneAt) {
    return { state: input.doneAt <= input.dueAt ? 'MET' : 'BREACHED', remainingMinutes: null };
  }
  if (input.stopped) return { state: 'STOPPED', remainingMinutes: null };
  const asOf = input.pausedAt ?? input.now;
  if (asOf > input.dueAt) return { state: 'BREACHED', remainingMinutes: 0 };
  const remaining = businessMinutesBetween(asOf, input.dueAt, input.calendar);
  if (input.pausedAt) return { state: 'PAUSED', remainingMinutes: remaining };
  return {
    state: remaining <= input.targetMinutes * SLA_AT_RISK_FRACTION ? 'AT_RISK' : 'ON_TRACK',
    remainingMinutes: remaining,
  };
}

/** "2 h 15 min", "1 d 3 h" (días hábiles de `dayMinutes`). */
export function formatBusinessDuration(minutes: number, dayMinutes = 9 * 60): string {
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / dayMinutes);
  const hours = Math.floor((minutes % dayMinutes) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}
