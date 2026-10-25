import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

// Cadena de hashes de la auditoría. Vive acá para que la API y los scripts de
// servidor (recover-access) escriban entradas con exactamente el mismo cálculo.

export const AUDIT_GENESIS_HASH = '0'.repeat(64);
// Clave arbitraria del advisory lock que serializa las inserciones de la cadena.
const AUDIT_LOCK_KEY = 727_001;

export type AuditHashInput = {
  occurredAt: Date;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  metadata: unknown;
};

/** JSON con claves ordenadas, para hashear siempre igual el mismo contenido. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function computeAuditHash(prevHash: string, row: AuditHashInput): string {
  const payload = canonicalJson({
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ip: row.ip,
    metadata: row.metadata ?? {},
  });
  return createHash('sha256').update(prevHash).update(payload).digest('hex');
}

/** Agrega una entrada al final de la cadena. Tiene que correr dentro de una transacción. */
export async function appendAuditEntry(
  tx: Prisma.TransactionClient,
  entry: Omit<AuditHashInput, 'occurredAt'>,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
  const prevHash = last?.hash ?? AUDIT_GENESIS_HASH;
  const row: AuditHashInput = { occurredAt: new Date(), ...entry, metadata: entry.metadata ?? {} };
  await tx.auditLog.create({
    data: {
      ...row,
      metadata: row.metadata as Prisma.InputJsonValue,
      prevHash,
      hash: computeAuditHash(prevHash, row),
    },
  });
}
