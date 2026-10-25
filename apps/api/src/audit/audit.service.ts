import { Injectable } from '@nestjs/common';
import { AUDIT_GENESIS_HASH, appendAuditEntry, computeAuditHash, Prisma } from '@tli/db';
import type {
  AuditAction,
  AuditLogItem,
  AuditQuery,
  AuditVerifyResponse,
  Paginated,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  /** Solo IDs y campos cambiados. Nunca contraseñas, secretos, tokens ni contenido. */
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Agrega una entrada a la cadena. Si se pasa `tx`, queda dentro de esa transacción. */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) return this.insert(tx, entry);
    await this.prisma.$transaction((t) => this.insert(t, entry));
  }

  private insert(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    return appendAuditEntry(tx, {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ip: entry.ip ?? null,
      metadata: entry.metadata ?? {},
    });
  }

  async list(q: AuditQuery): Promise<Paginated<AuditLogItem>> {
    const where: Prisma.AuditLogWhereInput = {
      action: q.action,
      actorId: q.actorId,
      entityType: q.entityType,
      entityId: q.entityId,
      occurredAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        seq: r.seq.toString(),
        occurredAt: r.occurredAt.toISOString(),
        action: r.action,
        actor: r.actor,
        entityType: r.entityType,
        entityId: r.entityId,
        ip: r.ip,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      })),
    };
  }

  /** Recorre la cadena completa y verifica cada hash. */
  async verifyChain(): Promise<AuditVerifyResponse> {
    const BATCH = 1000;
    let prevHash = AUDIT_GENESIS_HASH;
    let cursor: bigint | undefined;
    let checked = 0;
    for (;;) {
      const rows = await this.prisma.auditLog.findMany({
        where: cursor !== undefined ? { seq: { gt: cursor } } : undefined,
        orderBy: { seq: 'asc' },
        take: BATCH,
      });
      for (const r of rows) {
        const expected = computeAuditHash(prevHash, r);
        if (r.prevHash !== prevHash || r.hash !== expected) {
          return { ok: false, checked, brokenAtSeq: r.seq.toString() };
        }
        prevHash = r.hash;
        checked++;
      }
      if (rows.length < BATCH) break;
      cursor = rows[rows.length - 1]!.seq;
    }
    return { ok: true, checked, brokenAtSeq: null };
  }
}
