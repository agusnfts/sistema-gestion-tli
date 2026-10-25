import { z } from 'zod';
import { PRIORITIES, type Priority } from '../tickets';

const minutes = z.coerce
  .number()
  .int()
  .min(1)
  .max(60 * 24 * 60);
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM');

export const slaPoliciesSchema = z.object({
  support: z.object(
    Object.fromEntries(
      PRIORITIES.map((p) => [
        p,
        z.object({ firstResponseMinutes: minutes, resolutionMinutes: minutes }),
      ]),
    ) as Record<
      Priority,
      z.ZodObject<{ firstResponseMinutes: typeof minutes; resolutionMinutes: typeof minutes }>
    >,
  ),
  proposalFirstResponseMinutes: minutes,
});

const dayHours = z
  .object({ start: hm, end: hm })
  .refine((d) => d.end > d.start, { message: 'La hora de fin tiene que ser posterior al inicio' });

export const businessHoursSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    days: z.object({
      0: dayHours.optional(),
      1: dayHours.optional(),
      2: dayHours.optional(),
      3: dayHours.optional(),
      4: dayHours.optional(),
      5: dayHours.optional(),
      6: dayHours.optional(),
    }),
  })
  .refine((v) => Object.values(v.days).some(Boolean), 'Tiene que haber al menos un día hábil');

export const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  name: z.string().trim().min(2).max(120),
});
export type HolidayInput = z.infer<typeof holidaySchema>;
export type Holiday = HolidayInput & { id: string };

export const autoCloseSchema = z.object({
  enabled: z.boolean(),
  businessDays: z.coerce.number().int().min(1).max(60),
});
export type AutoCloseSettings = z.infer<typeof autoCloseSchema>;

export const DEFAULT_AUTO_CLOSE: AutoCloseSettings = { enabled: false, businessDays: 5 };

export const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

// --- Notificaciones ---------------------------------------------------------

export const NOTIFICATION_KINDS = [
  'TICKET_CREATED',
  'TICKET_ASSIGNED',
  'TICKET_STATUS_CHANGED',
  'TICKET_COMMENTED',
  'TICKET_SLA_AT_RISK',
  'TICKET_SLA_BREACHED',
  'FILE_INFECTED',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Claves de la tabla Setting. */
export const SETTING_KEYS = {
  slaPolicies: 'sla.policies',
  businessHours: 'calendar.businessHours',
  autoClose: 'tickets.autoClose',
  email: 'notifications.email',
} as const;

export const emailSettingsSchema = z.object({ enabled: z.boolean() });
export type EmailSettings = z.infer<typeof emailSettingsSchema>;
export const DEFAULT_EMAIL_SETTINGS: EmailSettings = { enabled: false };

/** Estado del mail saliente. El servidor SMTP se configura por variables de entorno. */
export type EmailSettingsResponse = EmailSettings & {
  smtpConfigured: boolean;
  from: string | null;
};
