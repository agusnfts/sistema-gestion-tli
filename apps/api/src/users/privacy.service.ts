import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword } from '@tli/db';
import { formatTicketNumber } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';
import { htmlToPlainText } from '../common/rich-text';
import type { AuthContext, RequestMeta } from '../common/auth-context';

/**
 * Derechos de los titulares (Ley 25.326 arts. 14 y 16; RGPD arts. 15, 17 y 20). Ver
 * docs/data-processing-register.md.
 *
 * - Exportar: todos los datos personales del usuario en JSON (sin hashes ni secretos).
 * - Anonimizar: se reemplazan nombre y email, se borran sesiones, MFA, códigos y avisos. Los
 *   tickets y la auditoría se conservan (registros de la operación y obligación de trazabilidad)
 *   apuntando a un usuario anonimizado. El texto libre que la persona escribió en tickets no
 *   se reescribe: si tiene datos personales, se edita a mano (queda documentado).
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async export(id: string, actor: AuthContext, meta: RequestMeta) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: { select: { key: true, name: true } } } },
        defaultArea: { select: { name: true } },
        defaultWarehouse: { select: { name: true } },
      },
    });
    if (!u) throw new NotFoundException('Usuario inexistente');
    const [tickets, comments, timeEntries, attachments, sessions, notifications, audit] =
      await Promise.all([
        this.prisma.ticket.findMany({
          where: { requesterId: id },
          orderBy: { createdAt: 'asc' },
          select: {
            number: true,
            type: true,
            category: true,
            subject: true,
            description: true,
            status: true,
            extraFields: true,
            createdAt: true,
            closedAt: true,
          },
        }),
        this.prisma.ticketComment.findMany({
          where: { authorId: id },
          orderBy: { createdAt: 'asc' },
          select: {
            body: true,
            visibility: true,
            createdAt: true,
            ticket: { select: { number: true } },
          },
        }),
        this.prisma.timeEntry.findMany({
          where: { userId: id },
          select: {
            minutes: true,
            workDate: true,
            note: true,
            ticket: { select: { number: true } },
          },
        }),
        this.prisma.attachment.findMany({
          where: { uploadedById: id },
          select: { originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        }),
        this.prisma.session.findMany({
          where: { userId: id },
          select: { createdAt: true, lastSeenAt: true, revokedAt: true, ip: true, userAgent: true },
        }),
        this.prisma.notification.findMany({
          where: { userId: id },
          select: { title: true, body: true, createdAt: true, readAt: true },
        }),
        this.prisma.auditLog.findMany({
          where: { actorId: id },
          orderBy: { seq: 'asc' },
          select: { occurredAt: true, action: true, entityType: true, ip: true },
        }),
      ]);

    await this.audit.log({
      action: 'privacy.exported',
      actorId: actor.user.id,
      entityType: 'user',
      entityId: id,
      ip: meta.ip,
    });

    return {
      exportedAt: new Date().toISOString(),
      notice:
        'Datos personales registrados en el Sistema de Gestión TLI de TML Logística. ' +
        'Responsable: área TLI. Ver docs/data-processing-register.md.',
      user: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        status: u.status,
        roles: u.roles.map((r) => r.role.name),
        defaultArea: u.defaultArea?.name ?? null,
        defaultWarehouse: u.defaultWarehouse?.name ?? null,
        mfaEnabled: !!u.mfaEnabledAt,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        anonymizedAt: u.anonymizedAt,
      },
      tickets: tickets.map((t) => ({ ...t, number: formatTicketNumber(t.number) })),
      comments: comments.map((c) => ({
        ticket: formatTicketNumber(c.ticket.number),
        body: htmlToPlainText(c.body),
        visibility: c.visibility,
        createdAt: c.createdAt,
      })),
      timeEntries: timeEntries.map((t) => ({ ...t, ticket: formatTicketNumber(t.ticket.number) })),
      attachments,
      sessions,
      notifications,
      auditTrail: audit,
    };
  }

  async anonymize(id: string, actor: AuthContext, meta: RequestMeta): Promise<{ ok: true }> {
    if (id === actor.user.id)
      throw new BadRequestException('No podés anonimizar tu propio usuario');
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: { select: { key: true } } } } },
    });
    if (!u) throw new NotFoundException('Usuario inexistente');
    if (u.anonymizedAt) throw new BadRequestException('El usuario ya está anonimizado');
    if (u.status === 'ACTIVE' && u.roles.some((r) => r.role.key === 'admin')) {
      await this.users.assertAnotherActiveAdmin(id);
    }
    // Contraseña aleatoria que nadie conoce: la cuenta no se puede volver a usar.
    const passwordHash = await hashPassword(randomBytes(32).toString('base64'));
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          fullName: `Usuario anonimizado ${id.slice(0, 8)}`,
          email: `${id}@anonimizado.invalid`,
          passwordHash,
          status: 'DISABLED',
          mustChangePassword: true,
          defaultAreaId: null,
          defaultWarehouseId: null,
          mfaSecretEnc: null,
          mfaPendingSecretEnc: null,
          mfaEnabledAt: null,
          mfaLastUsedStep: null,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          anonymizedAt: new Date(),
        },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await this.audit.log(
        {
          action: 'privacy.anonymized',
          actorId: actor.user.id,
          entityType: 'user',
          entityId: id,
          ip: meta.ip,
        },
        tx,
      );
    });
    return { ok: true };
  }
}
