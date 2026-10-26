import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import type { UserRef } from './tickets';

// --- Sistemas propios ---------------------------------------------------------

export const BUSINESS_SYSTEMS = ['WMS', 'TMS', 'TYT', 'ROUTING'] as const;
export type BusinessSystem = (typeof BUSINESS_SYSTEMS)[number];

export const BUSINESS_SYSTEM_LABELS: Record<BusinessSystem, string> = {
  WMS: 'WMS',
  TMS: 'TMS',
  TYT: 'TYT (carga de pedidos)',
  ROUTING: 'Ruteo',
};

export function isBusinessSystem(value: string): value is BusinessSystem {
  return (BUSINESS_SYSTEMS as readonly string[]).includes(value);
}

export type SystemInfoItem = {
  key: BusinessSystem;
  provider: { id: string; name: string } | null;
  notes: string | null;
};

export const updateSystemInfoSchema = z
  .object({
    providerId: uuidSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios');
export type UpdateSystemInfoInput = z.infer<typeof updateSystemInfoSchema>;

// --- Listas de distribución ---------------------------------------------------

const MAX_LIST_EMAILS = 200;

export const distributionListSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  emails: z
    .array(z.string().trim().toLowerCase().pipe(z.email('Mail inválido')))
    .min(1, 'Agregá al menos un mail')
    .max(MAX_LIST_EMAILS, `Máximo ${MAX_LIST_EMAILS} mails por lista`)
    .transform((list) => [...new Set(list)]),
  active: z.boolean().default(true),
});
export type DistributionListInput = z.infer<typeof distributionListSchema>;

export const updateDistributionListSchema = distributionListSchema.partial();
export type UpdateDistributionListInput = z.infer<typeof updateDistributionListSchema>;

export type DistributionListItem = {
  id: string;
  name: string;
  description: string | null;
  emails: string[];
  active: boolean;
};

/** Separa una lista pegada (comas, punto y coma, espacios o renglones) en mails. */
export function splitEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// --- Avisos de actualización --------------------------------------------------

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'DONE', 'CANCELLED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Avisada',
  DONE: 'Realizada',
  CANCELLED: 'Cancelada',
};

export const ANNOUNCEMENT_IMPACTS = ['NONE', 'DEGRADED', 'OUTAGE'] as const;
export type AnnouncementImpact = (typeof ANNOUNCEMENT_IMPACTS)[number];

export const ANNOUNCEMENT_IMPACT_LABELS: Record<AnnouncementImpact, string> = {
  NONE: 'Sin corte: se puede seguir trabajando',
  DEGRADED: 'Puede andar lento o con cortes breves',
  OUTAGE: 'Sistema fuera de servicio durante la actualización',
};

export const ANNOUNCEMENT_SEND_KINDS = ['NOTICE', 'REMINDER', 'DONE', 'CANCELLED'] as const;
export type AnnouncementSendKind = (typeof ANNOUNCEMENT_SEND_KINDS)[number];

export const ANNOUNCEMENT_SEND_KIND_LABELS: Record<AnnouncementSendKind, string> = {
  NOTICE: 'Aviso',
  REMINDER: 'Recordatorio',
  DONE: 'Actualización finalizada',
  CANCELLED: 'Cancelación',
};

export function formatAnnouncementCode(n: number): string {
  return `ACT-${String(n).padStart(4, '0')}`;
}

export function isAnnouncementOpen(status: AnnouncementStatus): boolean {
  return status === 'DRAFT' || status === 'SCHEDULED';
}

const MAX_TARGETS = 50;

const announcementFields = z.object({
  title: z.string().trim().min(5, 'Contá en pocas palabras qué se actualiza').max(150),
  systems: z
    .array(z.enum(BUSINESS_SYSTEMS))
    .min(1, 'Elegí al menos un sistema')
    .transform((list) => [...new Set(list)]),
  reason: z.string().trim().min(5, 'Contá por qué se actualiza').max(2000),
  details: z.string().trim().max(5000).nullable().optional(),
  impact: z.enum(ANNOUNCEMENT_IMPACTS, { error: 'Elegí una opción' }),
  startsAt: z.coerce.date({ error: 'Indicá fecha y hora' }),
  endsAt: z.coerce.date().nullable().optional(),
  reminderHours: z.number().int().min(1).max(168).nullable().optional(),
  distributionListIds: z.array(uuidSchema).max(MAX_TARGETS).optional(),
  warehouseIds: z.array(uuidSchema).max(MAX_TARGETS).optional(),
  areaIds: z.array(uuidSchema).max(MAX_TARGETS).optional(),
});

const endsAfterStart = (v: { startsAt?: Date; endsAt?: Date | null }) =>
  !v.startsAt || !v.endsAt || v.endsAt > v.startsAt;
const endsAfterStartIssue = {
  message: 'El fin tiene que ser posterior al inicio',
  path: ['endsAt'],
};

export const createAnnouncementSchema = announcementFields.refine(
  endsAfterStart,
  endsAfterStartIssue,
);
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = announcementFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios')
  .refine(endsAfterStart, endsAfterStartIssue);
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

export const closeAnnouncementSchema = z.object({
  /** Mensaje para la operación (qué se hizo, o por qué se cancela). */
  note: z.string().trim().max(2000).optional(),
  /** Avisar por mail a los mismos destinatarios (solo si el aviso ya se había enviado). */
  notify: z.boolean().default(true),
});
export type CloseAnnouncementInput = z.infer<typeof closeAnnouncementSchema>;

export const cancelAnnouncementSchema = closeAnnouncementSchema.extend({
  note: z.string().trim().min(5, 'Contá por qué se cancela').max(2000),
});
export type CancelAnnouncementInput = z.infer<typeof cancelAnnouncementSchema>;

export const listAnnouncementsQuerySchema = paginationSchema.extend({
  state: z.enum(['open', 'closed', 'all']).default('open'),
  system: z.enum(BUSINESS_SYSTEMS).optional(),
});
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;

// --- Respuestas ---------------------------------------------------------------

export type AnnouncementListItem = {
  id: string;
  code: string;
  title: string;
  systems: BusinessSystem[];
  impact: AnnouncementImpact;
  status: AnnouncementStatus;
  startsAt: string;
  endsAt: string | null;
  sentAt: string | null;
};

export type AnnouncementRecipients = { emailCount: number; userCount: number };

export type AnnouncementSendItem = {
  id: string;
  kind: AnnouncementSendKind;
  emailCount: number;
  userCount: number;
  /** false: el mail no estaba activo y solo se avisó en la campana. */
  emailed: boolean;
  sentBy: UserRef | null;
  createdAt: string;
};

export type AnnouncementDetail = AnnouncementListItem & {
  reason: string;
  details: string | null;
  reminderHours: number | null;
  reminderSentAt: string | null;
  closedAt: string | null;
  closingNote: string | null;
  createdBy: UserRef;
  createdAt: string;
  /** Proveedor de cada sistema afectado (catálogo de Sistemas). */
  providers: { system: BusinessSystem; provider: string | null }[];
  distributionLists: { id: string; name: string; emailCount: number }[];
  warehouses: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  recipients: AnnouncementRecipients;
  sends: AnnouncementSendItem[];
  /** Si hoy hay mail activo (SMTP configurado y habilitado por el Admin). */
  emailActive: boolean;
};

export type SendAnnouncementResponse = AnnouncementRecipients & {
  emailed: boolean;
  announcement: AnnouncementDetail;
};

/** Lo que ve cualquier usuario: actualizaciones avisadas en curso o próximas. */
export type UpcomingAnnouncement = {
  id: string;
  code: string;
  title: string;
  systems: BusinessSystem[];
  impact: AnnouncementImpact;
  startsAt: string;
  endsAt: string | null;
  inProgress: boolean;
};
