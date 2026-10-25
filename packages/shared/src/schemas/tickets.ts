import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import {
  isCategoryAllowed,
  PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type Priority,
  type SlaState,
  type TicketCategory,
  type TicketStatus,
  type TicketType,
} from '../tickets';

const subject = z
  .string()
  .trim()
  .min(5, 'Contá en pocas palabras de qué se trata (mínimo 5 caracteres)')
  .max(150);
const description = z
  .string()
  .trim()
  .min(10, 'Agregá un poco más de detalle (mínimo 10 caracteres)')
  .max(10_000);
const choose = { error: 'Elegí una opción' };

/** Adjuntos: límites y tipos permitidos (ADR 0006). */
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'docx',
  'xlsx',
  'zip',
  'txt',
  'csv',
  'xml',
  'json',
  'md',
  'log',
] as const;

export const SCAN_STATUSES = ['PENDING_SCAN', 'CLEAN', 'INFECTED'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export type AttachmentInfo = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  scanStatus: ScanStatus;
};
const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .optional()
  .or(z.literal('').transform(() => undefined));

// Sector afectado: un depósito, un área (Comercial, Calidad…) o ninguno.
const common = {
  category: z.enum(TICKET_CATEGORIES, choose),
  subject,
  description,
  warehouseId: uuidSchema.nullable().optional(),
  areaId: uuidSchema.nullable().optional(),
  attachmentIds: z
    .array(uuidSchema)
    .max(MAX_ATTACHMENTS, `Hasta ${MAX_ATTACHMENTS} adjuntos`)
    .optional(),
};

export const INTEGRATION_COUNTERPARTS = ['CLIENT', 'CARRIER', 'OTHER'] as const;
export const INTEGRATION_COUNTERPART_LABELS: Record<
  (typeof INTEGRATION_COUNTERPARTS)[number],
  string
> = {
  CLIENT: 'Un cliente',
  CARRIER: 'Un expreso',
  OTHER: 'Otro',
};

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'OCCASIONAL'] as const;
export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  DAILY: 'Todos los días',
  WEEKLY: 'Todas las semanas',
  MONTHLY: 'Todos los meses',
  OCCASIONAL: 'De vez en cuando',
};

export const INTEGRATION_PROCESSES = [
  'INBOUND_ORDERS',
  'OUTBOUND_ORDERS',
  'STOCK',
  'DELIVERY_NOTES',
  'CONFIRMATIONS',
  'TRACKING',
  'LABELS',
  'OTHER',
] as const;
export const INTEGRATION_PROCESS_LABELS: Record<(typeof INTEGRATION_PROCESSES)[number], string> = {
  INBOUND_ORDERS: 'Órdenes de ingreso',
  OUTBOUND_ORDERS: 'Pedidos de salida',
  STOCK: 'Stock',
  DELIVERY_NOTES: 'Remitos',
  CONFIRMATIONS: 'Confirmaciones',
  TRACKING: 'Seguimiento',
  LABELS: 'Etiquetas',
  OTHER: 'Otro',
};

export const INTEGRATION_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL', 'UNKNOWN'] as const;
export const INTEGRATION_DIRECTION_LABELS: Record<(typeof INTEGRATION_DIRECTIONS)[number], string> =
  {
    INBOUND: 'Nos envían datos a nosotros',
    OUTBOUND: 'Nosotros les enviamos datos',
    BIDIRECTIONAL: 'En los dos sentidos',
    UNKNOWN: 'No sé',
  };

export const ACCESS_ACTIONS = ['NEW', 'CHANGE', 'REMOVE'] as const;
export const ACCESS_ACTION_LABELS: Record<(typeof ACCESS_ACTIONS)[number], string> = {
  NEW: 'Alta de usuario',
  CHANGE: 'Cambio de permisos',
  REMOVE: 'Baja de usuario',
};

/** Preguntas específicas de cada tipo (se guardan en Ticket.extraFields). */
export const ticketExtraSchemas = {
  SUPPORT: z.object({ errorMessage: optionalText(2000) }),
  AUTOMATION: z.object({
    currentProcess: z
      .string({ error: 'Contá cómo se hace hoy' })
      .trim()
      .min(10, 'Contá cómo se hace hoy')
      .max(3000),
    frequency: z.enum(FREQUENCIES, choose),
    minutesPerOccurrence: z.coerce.number().int().min(0).max(100_000).optional(),
    expectedBenefit: z
      .string({ error: 'Contá qué se ganaría' })
      .trim()
      .min(5, 'Contá qué se ganaría')
      .max(3000),
  }),
  INTEGRATION: z.object({
    counterpartType: z.enum(INTEGRATION_COUNTERPARTS, choose),
    counterpartName: z
      .string({ error: 'Indicá con quién es la integración' })
      .trim()
      .min(2, 'Indicá con quién es la integración')
      .max(150),
    // Una integración puede cubrir varios procesos (ej. pedidos de salida y stock).
    processes: z
      .array(z.enum(INTEGRATION_PROCESSES), { error: 'Elegí al menos un proceso' })
      .min(1, 'Elegí al menos un proceso')
      .max(INTEGRATION_PROCESSES.length)
      .transform((v) => [...new Set(v)]),
    direction: z.enum(INTEGRATION_DIRECTIONS, choose),
    formatOrChannel: optionalText(300),
    volume: optionalText(300),
    desiredDate: optionalDate,
  }),
  ACCESS: z.object({
    accessAction: z.enum(ACCESS_ACTIONS, choose),
    forWhom: z
      .string({ error: 'Indicá para quién es el acceso' })
      .trim()
      .min(2, 'Indicá para quién es el acceso')
      .max(200),
    neededBy: optionalDate,
  }),
} satisfies Record<TicketType, z.ZodTypeAny>;

export const createTicketSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('SUPPORT'),
      ...common,
      userUrgency: z.enum(PRIORITIES, choose),
      extra: ticketExtraSchemas.SUPPORT,
    }),
    z.object({
      type: z.literal('AUTOMATION'),
      ...common,
      userUrgency: z.enum(PRIORITIES).default('LOW'),
      extra: ticketExtraSchemas.AUTOMATION,
    }),
    z.object({
      type: z.literal('INTEGRATION'),
      ...common,
      category: z.literal('INTEGRATION').default('INTEGRATION'),
      userUrgency: z.enum(PRIORITIES).default('MEDIUM'),
      extra: ticketExtraSchemas.INTEGRATION,
    }),
    z.object({
      type: z.literal('ACCESS'),
      ...common,
      userUrgency: z.enum(PRIORITIES, choose),
      extra: ticketExtraSchemas.ACCESS,
    }),
  ])
  .superRefine((v, ctx) => {
    // Cada tipo de ticket admite solo algunas categorías (CATEGORIES_BY_TYPE).
    if (!isCategoryAllowed(v.type, v.category)) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Elegí una opción de la lista' });
    }
    if (v.warehouseId && v.areaId) {
      ctx.addIssue({
        code: 'custom',
        path: ['areaId'],
        message: 'Elegí un depósito o un área, no los dos',
      });
    }
  });
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const listTicketsQuerySchema = paginationSchema.extend({
  scope: z.enum(['mine', 'all']).default('mine'),
  state: z.enum(['open', 'resolved', 'closed', 'all']).default('open'),
  status: z.enum(TICKET_STATUSES).optional(),
  type: z.enum(TICKET_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  assignee: z.union([z.literal('me'), z.literal('none'), uuidSchema]).optional(),
  sla: z.enum(['at_risk', 'breached']).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const updateTicketSchema = z
  .object({
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    assigneeId: uuidSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios');
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const changeTicketStatusSchema = z
  .object({
    status: z.enum(TICKET_STATUSES),
    resolutionCause: z.string().trim().max(5000).optional(),
    resolutionSolution: z.string().trim().max(5000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'RESOLVED') return;
    if (!v.resolutionCause || v.resolutionCause.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['resolutionCause'], message: 'Indicá la causa' });
    }
    if (!v.resolutionSolution || v.resolutionSolution.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['resolutionSolution'], message: 'Indicá qué se hizo' });
    }
  });
export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusSchema>;

export const COMMENT_VISIBILITIES = ['PUBLIC', 'INTERNAL'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export const addCommentSchema = z.object({
  body: z.string().trim().min(1, 'Escribí un comentario').max(10_000),
  visibility: z.enum(COMMENT_VISIBILITIES).default('PUBLIC'),
  attachmentIds: z
    .array(uuidSchema)
    .max(MAX_ATTACHMENTS, `Hasta ${MAX_ATTACHMENTS} adjuntos`)
    .optional(),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const addTimeEntrySchema = z.object({
  minutes: z.coerce
    .number()
    .int()
    .min(1, 'Mínimo 1 minuto')
    .max(24 * 60),
  workDate: optionalDate,
  note: optionalText(500),
});
export type AddTimeEntryInput = z.infer<typeof addTimeEntrySchema>;

// --- Respuestas -------------------------------------------------------------

export type UserRef = { id: string; fullName: string };

export type SlaInfo = {
  state: SlaState;
  dueAt: string | null;
  remainingMinutes: number | null;
};

export type TicketListItem = {
  id: string;
  number: string;
  type: TicketType;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  priorityIsProvisional: boolean;
  requester: UserRef;
  assignee: UserRef | null;
  warehouse: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
  /** Problema (causa raíz) al que está vinculado. Solo se informa a IT. */
  problem: { id: string; code: string; title: string } | null;
  /** Mejora a la que se derivó. Solo se informa a quien puede ver mejoras. */
  improvement: { id: string; code: string; title: string } | null;
  /** Integración a la que se derivó. Solo se informa a quien puede ver integraciones. */
  integration: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  sla: { firstResponse: SlaInfo; resolution: SlaInfo };
};

export type TicketComment = {
  id: string;
  author: UserRef;
  body: string;
  visibility: CommentVisibility;
  createdAt: string;
  /** El autor es del equipo de IT (para distinguirlo en el hilo). */
  fromStaff: boolean;
  attachments: AttachmentInfo[];
};

export type TicketActivity = {
  id: string;
  kind: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  actor: UserRef | null;
  occurredAt: string;
};

export type TicketTimeEntry = {
  id: string;
  user: UserRef;
  minutes: number;
  workDate: string;
  note: string | null;
};

export type TicketDetail = TicketListItem & {
  description: string;
  userUrgency: Priority;
  extraFields: Record<string, unknown>;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionCause: string | null;
  resolutionSolution: string | null;
  /** Adjuntos de la carga inicial del ticket (los de comentarios van en cada comentario). */
  attachments: AttachmentInfo[];
  comments: TicketComment[];
  activity: TicketActivity[];
  /** Solo para IT. */
  timeEntries: TicketTimeEntry[] | null;
  totalMinutes: number | null;
  allowedTransitions: TicketStatus[];
  canComment: boolean;
  canManage: boolean;
};

export type CreateTicketResponse = { id: string; number: string };
