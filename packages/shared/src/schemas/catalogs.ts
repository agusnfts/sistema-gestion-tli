import { z } from 'zod';
import { paginationSchema } from './common';
import { AUDIT_ACTIONS } from '../audit';

export const CATALOG_KINDS = ['areas', 'warehouses', 'providers'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_LABELS: Record<CatalogKind, { singular: string; plural: string }> = {
  areas: { singular: 'Área', plural: 'Áreas' },
  warehouses: { singular: 'Depósito', plural: 'Depósitos' },
  providers: { singular: 'Proveedor', plural: 'Proveedores' },
};

export const catalogItemSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  active: z.boolean().default(true),
});
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;

export const updateCatalogItemSchema = catalogItemSchema.partial();
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

export type CatalogItem = { id: string; name: string; active: boolean };

export const auditQuerySchema = paginationSchema.extend({
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export type AuditLogItem = {
  seq: string;
  occurredAt: string;
  action: string;
  actor: { id: string; fullName: string; email: string } | null;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
};

export type AuditVerifyResponse = { ok: boolean; checked: number; brokenAtSeq: string | null };
