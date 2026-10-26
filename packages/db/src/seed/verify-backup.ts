// Verifica una base restaurada (simulacro de restauración): que la cadena de auditoría esté
// íntegra y que estén los datos. Sale con código 1 si algo falla.
// Uso: node packages/db/dist/seed/verify-backup.js
import { PrismaClient } from '@prisma/client';
import { AUDIT_GENESIS_HASH, computeAuditHash } from '../audit';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    let prev = AUDIT_GENESIS_HASH;
    let checked = 0;
    let cursor: bigint | undefined;
    for (;;) {
      const rows = await prisma.auditLog.findMany({
        where: cursor !== undefined ? { seq: { gt: cursor } } : undefined,
        orderBy: { seq: 'asc' },
        take: 1000,
      });
      for (const r of rows) {
        if (r.prevHash !== prev || r.hash !== computeAuditHash(prev, r)) {
          throw new Error(`Cadena de auditoría rota en la entrada ${r.seq}`);
        }
        prev = r.hash;
        checked++;
      }
      if (rows.length < 1000) break;
      cursor = rows[rows.length - 1]!.seq;
    }
    const [users, tickets, attachments, documents] = await Promise.all([
      prisma.user.count(),
      prisma.ticket.count(),
      prisma.attachment.count({ where: { scanStatus: 'CLEAN' } }),
      prisma.document.count(),
    ]);
    if (users === 0) throw new Error('No hay usuarios: la restauración está vacía');
    console.log(
      `OK · auditoría íntegra (${checked} entradas) · ${users} usuarios · ${tickets} tickets · ` +
        `${attachments} adjuntos · ${documents} documentos`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`FALLÓ: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
