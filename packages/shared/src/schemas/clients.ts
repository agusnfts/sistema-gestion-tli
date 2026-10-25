import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';
import type { ImprovementRef } from './improvements';
import type { IntegrationListItem } from './integrations';
import type { DocumentItem } from './documents';

export const CLIENT_STATUSES = ['ACTIVE', 'ONBOARDING', 'INACTIVE'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Activo',
  ONBOARDING: 'En alta',
  INACTIVE: 'Inactivo',
};

export const CONTACT_KINDS = ['COMMERCIAL', 'SYSTEMS', 'OTHER'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  COMMERCIAL: 'Comercial',
  SYSTEMS: 'Sistemas',
  OTHER: 'Otro',
};

/** CUIT/CUIL: 11 dígitos con dígito verificador (módulo 11). Acepta guiones y espacios. */
export function normalizeCuit(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(digits)) return null;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]) ? digits : null;
}

export function formatCuit(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

const cuitSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return null;
    const n = normalizeCuit(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'CUIT inválido (revisá los 11 dígitos)' });
      return z.NEVER;
    }
    return n;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const clientSchema = z.object({
  legalName: z.string().trim().min(2, 'Indicá la razón social').max(200),
  shortName: optionalText(80),
  cuit: cuitSchema.nullable().optional(),
  status: z.enum(CLIENT_STATUSES).default('ACTIVE'),
  address: optionalText(300),
  notes: optionalText(5000),
  warehouseIds: z.array(uuidSchema).max(50).default([]),
});
export type ClientInput = z.input<typeof clientSchema>;
export type ClientParsed = z.output<typeof clientSchema>;

export const updateClientSchema = clientSchema.partial();
export type UpdateClientInput = z.output<typeof updateClientSchema>;

export const contactSchema = z.object({
  kind: z.enum(CONTACT_KINDS).default('OTHER'),
  role: optionalText(80),
  name: z.string().trim().min(2, 'Indicá el nombre').max(150),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email inválido')
    .max(200)
    .or(z.literal('').transform(() => null))
    .nullable()
    .optional(),
  phone: optionalText(50),
  notes: optionalText(1000),
});
export type ContactInput = z.input<typeof contactSchema>;
export type ContactParsed = z.output<typeof contactSchema>;

export const listClientsQuerySchema = paginationSchema.extend({
  status: z.enum(CLIENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

// --- Respuestas -------------------------------------------------------------

export type ClientRef = { id: string; legalName: string; shortName: string | null };

export type ClientListItem = ClientRef & {
  cuit: string | null;
  status: ClientStatus;
  warehouses: { id: string; name: string }[];
  integrationCount: number;
  pendingIntegrationCount: number;
  updatedAt: string;
};

export type ClientContactItem = {
  id: string;
  kind: ContactKind;
  role: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type ClientDetail = ClientListItem & {
  address: string | null;
  f50Folio: string | null;
  notes: string | null;
  createdAt: string;
  contacts: ClientContactItem[];
  integrations: IntegrationListItem[];
  improvements: ImprovementRef[];
  documents: DocumentItem[];
};

// --- Importación del F50 (formulario de alta de clientes) ---------------------

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type F50ImportAction = 'create' | 'update' | 'skip';

export type F50ImportRow = {
  /** Número de fila en la planilla (la 1 son los encabezados). */
  row: number;
  folio: string | null;
  legalName: string;
  cuit: string | null;
  action: F50ImportAction;
  /** Cliente existente con el que se cruzó (por CUIT, folio o razón social). */
  matchedBy: 'cuit' | 'folio' | 'name' | null;
  inactive: boolean;
  newContacts: number;
  warnings: string[];
};

export type F50ImportResult = {
  dryRun: boolean;
  sheet: string;
  sheets: string[];
  rows: F50ImportRow[];
  totals: { create: number; update: number; skip: number; contacts: number };
};
