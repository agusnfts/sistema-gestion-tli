import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import {
  INTEGRATION_COUNTERPARTS,
  INTEGRATION_PROCESSES,
  MAX_ATTACHMENTS,
  type AttachmentInfo,
  type TicketActivity,
  type UserRef,
} from './tickets';
import { CURRENCIES, type Currency } from './improvements';
import type { TicketStatus } from '../tickets';
import type { ClientRef } from './clients';
import type { PlatformRef } from './catalogs';
import type { DocumentItem } from './documents';
import type { WorkLogEntry } from './work-log';

export type IntegrationCounterpart = (typeof INTEGRATION_COUNTERPARTS)[number];
export type IntegrationProcess = (typeof INTEGRATION_PROCESSES)[number];

export const INTEGRATION_COUNTERPART_TYPE_LABELS: Record<IntegrationCounterpart, string> = {
  CLIENT: 'Cliente',
  CARRIER: 'Expreso',
  OTHER: 'Otro',
};

export const INTEGRATION_SYSTEMS = ['WMS', 'TMS', 'TYT', 'ROUTING'] as const;
export type IntegrationSystem = (typeof INTEGRATION_SYSTEMS)[number];
export const INTEGRATION_SYSTEM_LABELS: Record<IntegrationSystem, string> = {
  WMS: 'WMS',
  TMS: 'TMS',
  TYT: 'TYT',
  ROUTING: 'Ruteo',
};

export const INTEGRATION_FLOWS = ['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL'] as const;
export type IntegrationFlow = (typeof INTEGRATION_FLOWS)[number];
export const INTEGRATION_FLOW_LABELS: Record<IntegrationFlow, string> = {
  INBOUND: 'Entrada (nos envían)',
  OUTBOUND: 'Salida (enviamos)',
  BIDIRECTIONAL: 'Bidireccional',
};

export const INTEGRATION_CHANNELS = [
  'FTP_SFTP',
  'NETWORK_FOLDER',
  'EMAIL',
  'API',
  'EDI',
  'MANUAL',
] as const;
export type IntegrationChannel = (typeof INTEGRATION_CHANNELS)[number];
export const INTEGRATION_CHANNEL_LABELS: Record<IntegrationChannel, string> = {
  FTP_SFTP: 'FTP / SFTP',
  NETWORK_FOLDER: 'Carpeta de red',
  EMAIL: 'Email',
  API: 'API',
  EDI: 'EDI',
  MANUAL: 'Manual',
};

export const INTEGRATION_FORMATS = ['CSV', 'FIXED_WIDTH_TXT', 'XML', 'JSON', 'EXCEL'] as const;
export type IntegrationFormat = (typeof INTEGRATION_FORMATS)[number];
export const INTEGRATION_FORMAT_LABELS: Record<IntegrationFormat, string> = {
  CSV: 'CSV',
  FIXED_WIDTH_TXT: 'TXT posicional',
  XML: 'XML',
  JSON: 'JSON',
  EXCEL: 'Excel',
};

export const INTEGRATION_STATUSES = [
  'PENDING_SURVEY',
  'PENDING_QUOTE',
  'QUOTED',
  'IN_DEVELOPMENT',
  'COMPLETED',
  'NOT_DONE',
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  PENDING_SURVEY: 'Pendiente de relevar',
  PENDING_QUOTE: 'Pendiente de cotizar',
  QUOTED: 'Cotizada',
  IN_DEVELOPMENT: 'En desarrollo',
  COMPLETED: 'Finalizada',
  NOT_DONE: 'No realizada',
};

/** Estados finales: al llegar se cierran los tickets derivados con el mensaje de cierre. */
export function isIntegrationFinal(status: IntegrationStatus): boolean {
  return status === 'COMPLETED' || status === 'NOT_DONE';
}

export const NOT_DONE_REASONS = ['CLIENT_REJECTED_COST', 'TML_REJECTED_COST', 'OTHER'] as const;
export type NotDoneReason = (typeof NOT_DONE_REASONS)[number];
export const NOT_DONE_REASON_LABELS: Record<NotDoneReason, string> = {
  CLIENT_REJECTED_COST: 'El cliente no aprobó el costo',
  TML_REJECTED_COST: 'TML no aprobó el costo',
  OTHER: 'Otro motivo',
};

/** Plantilla inicial de "Cómo funciona" (HTML del editor: un título por sección). */
export const HOW_IT_WORKS_TEMPLATE = [
  'Flujo',
  'Origen y destino',
  'Archivo',
  'Validaciones y errores',
  'Monitoreo',
  'Contactos',
]
  .map((t) => `<h3>${t}</h3><p></p>`)
  .join('');

export function formatIntegrationCode(n: number): string {
  return `INT-${String(n).padStart(4, '0')}`;
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
/** Lista sin repetidos y con al menos un valor (procesos, sistemas). */
const uniqueList = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z
    .array(z.enum(values))
    .min(1, message)
    .max(values.length)
    .transform((v) => [...new Set(v)]);
const money = z.number().nonnegative().max(1e12);
const hours = z.number().nonnegative().max(100_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

const counterpartFields = {
  counterpartType: z.enum(INTEGRATION_COUNTERPARTS, { error: 'Elegí con quién es' }),
  clientId: uuidSchema.nullable().optional(),
  counterpartName: text(150),
};

/** Con cliente: tiene que venir el cliente del maestro. Con expreso u otro: el nombre. */
function refineCounterpart(
  v: {
    counterpartType?: IntegrationCounterpart;
    clientId?: string | null;
    counterpartName?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (v.counterpartType === 'CLIENT' && !v.clientId) {
    ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'Elegí el cliente' });
  }
  if (v.counterpartType && v.counterpartType !== 'CLIENT' && !v.counterpartName) {
    ctx.addIssue({
      code: 'custom',
      path: ['counterpartName'],
      message: 'Indicá con quién es la integración',
    });
  }
}

export const createIntegrationSchema = z
  .object({
    name: z.string().trim().min(3, 'Poné un nombre (ej. Remitos a Cliente X)').max(150),
    ...counterpartFields,
    processes: uniqueList(INTEGRATION_PROCESSES, 'Elegí al menos un proceso'),
    systems: uniqueList(INTEGRATION_SYSTEMS, 'Elegí al menos un sistema'),
    platformIds: z.array(uuidSchema).max(20).default([]),
    direction: z.enum(INTEGRATION_FLOWS).nullable().optional(),
    channel: z.enum(INTEGRATION_CHANNELS).nullable().optional(),
    format: z.enum(INTEGRATION_FORMATS).nullable().optional(),
    frequency: text(100),
    location: text(500),
    requiresDevelopment: z.boolean().default(true),
    /** Tickets abiertos que se derivan a la integración al crearla. */
    ticketIds: z.array(uuidSchema).max(50).optional(),
  })
  .superRefine(refineCounterpart);
export type CreateIntegrationInput = z.input<typeof createIntegrationSchema>;
export type CreateIntegrationParsed = z.output<typeof createIntegrationSchema>;

export const updateIntegrationSchema = z
  .object({
    name: z.string().trim().min(3).max(150).optional(),
    counterpartType: z.enum(INTEGRATION_COUNTERPARTS).optional(),
    clientId: uuidSchema.nullable().optional(),
    counterpartName: text(150),
    processes: uniqueList(INTEGRATION_PROCESSES, 'Elegí al menos un proceso').optional(),
    systems: uniqueList(INTEGRATION_SYSTEMS, 'Elegí al menos un sistema').optional(),
    platformIds: z.array(uuidSchema).max(20).optional(),
    direction: z.enum(INTEGRATION_FLOWS).nullable().optional(),
    channel: z.enum(INTEGRATION_CHANNELS).nullable().optional(),
    format: z.enum(INTEGRATION_FORMATS).nullable().optional(),
    frequency: text(100),
    location: text(500),
    requiresDevelopment: z.boolean().optional(),
    ownerId: uuidSchema.nullable().optional(),
    currency: z.enum(CURRENCIES).optional(),
    estimatedHours: hours.nullable().optional(),
    actualHours: hours.nullable().optional(),
    actualCost: money.nullable().optional(),
    startDate: isoDate.nullable().optional(),
    targetDate: isoDate.nullable().optional(),
    goLiveDate: isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios');
export type UpdateIntegrationInput = z.output<typeof updateIntegrationSchema>;

export const howItWorksSchema = z.object({
  howItWorks: z.string().max(50_000),
});
export type HowItWorksInput = z.infer<typeof howItWorksSchema>;

export const changeIntegrationStatusSchema = z
  .object({
    status: z.enum(INTEGRATION_STATUSES),
    notDoneReason: z.enum(NOT_DONE_REASONS).optional(),
    notDoneNotes: z.string().trim().max(2000).optional(),
    /** Obligatorio al finalizar o no realizar: lo reciben los solicitantes de los tickets derivados. */
    closingMessage: z.string().trim().max(5000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'NOT_DONE' && !v.notDoneReason) {
      ctx.addIssue({ code: 'custom', path: ['notDoneReason'], message: 'Elegí el motivo' });
    }
    if (isIntegrationFinal(v.status) && (v.closingMessage?.length ?? 0) < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['closingMessage'],
        message: 'Escribí el mensaje de cierre para los solicitantes',
      });
    }
  });
export type ChangeIntegrationStatusInput = z.infer<typeof changeIntegrationStatusSchema>;

export const quoteSchema = z.object({
  providerId: uuidSchema,
  amount: money,
  currency: z.enum(CURRENCIES).default('ARS'),
  estimatedHours: hours.nullable().optional(),
  quotedAt: isoDate,
  notes: text(2000),
  attachmentIds: z
    .array(uuidSchema)
    .max(MAX_ATTACHMENTS, `Hasta ${MAX_ATTACHMENTS} adjuntos`)
    .optional(),
});
export type QuoteInput = z.input<typeof quoteSchema>;
export type QuoteParsed = z.output<typeof quoteSchema>;

export const listIntegrationsQuerySchema = paginationSchema.extend({
  state: z.enum(['pending', 'closed', 'all']).default('pending'),
  status: z.enum(INTEGRATION_STATUSES).optional(),
  system: z.enum(INTEGRATION_SYSTEMS).optional(),
  platformId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListIntegrationsQuery = z.infer<typeof listIntegrationsQuerySchema>;

// --- Respuestas -------------------------------------------------------------

export type IntegrationRef = {
  id: string;
  code: string;
  name: string;
  status: IntegrationStatus;
};

export type IntegrationListItem = IntegrationRef & {
  counterpartType: IntegrationCounterpart;
  client: ClientRef | null;
  /** Nombre a mostrar: el del cliente o el indicado para expresos y otros. */
  counterpartLabel: string;
  processes: IntegrationProcess[];
  systems: IntegrationSystem[];
  platforms: PlatformRef[];
  direction: IntegrationFlow | null;
  channel: IntegrationChannel | null;
  owner: UserRef | null;
  targetDate: string | null;
  notDoneReason: NotDoneReason | null;
  ticketCount: number;
  updatedAt: string;
};

export type IntegrationQuoteItem = {
  id: string;
  provider: { id: string; name: string };
  amount: number;
  currency: Currency;
  estimatedHours: number | null;
  quotedAt: string;
  notes: string | null;
  isSelected: boolean;
  attachments: AttachmentInfo[];
  createdBy: UserRef;
};

export type IntegrationRevisionItem = {
  id: string;
  howItWorks: string;
  author: UserRef;
  createdAt: string;
};

export type IntegrationTicket = {
  id: string;
  number: string;
  subject: string;
  status: TicketStatus;
  requester: UserRef;
  createdAt: string;
};

export type IntegrationDetail = IntegrationListItem & {
  counterpartName: string | null;
  format: IntegrationFormat | null;
  frequency: string | null;
  location: string | null;
  requiresDevelopment: boolean;
  notDoneNotes: string | null;
  howItWorks: string;
  currency: Currency;
  estimatedHours: number | null;
  actualHours: number | null;
  actualCost: number | null;
  /** Costo de la cotización elegida (null si no hay). */
  estimatedCost: { amount: number; currency: Currency } | null;
  startDate: string | null;
  goLiveDate: string | null;
  closingMessage: string | null;
  completedAt: string | null;
  createdBy: UserRef;
  createdAt: string;
  quotes: IntegrationQuoteItem[];
  revisions: IntegrationRevisionItem[];
  tickets: IntegrationTicket[];
  documents: DocumentItem[];
  actions: WorkLogEntry[];
  activity: TicketActivity[];
};

export type ChangeIntegrationStatusResponse = {
  integration: IntegrationDetail;
  closedTickets: number;
};
